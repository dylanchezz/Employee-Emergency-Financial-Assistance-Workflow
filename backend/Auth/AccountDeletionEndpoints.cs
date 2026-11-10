using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using backend.Data;
using backend.Requests;

namespace backend.Auth;

// C2 — account deletion as SOFT-DELETE (scope locked in Impact Log A23).
//
//  The user (any signed-in account, for THEIR OWN account):
//    GET  /api/me/deletion-request          → their latest request (or null)
//    POST /api/me/deletion-request          → open a Pending request   { reason? }
//    POST /api/me/deletion-request/cancel   → cancel it while still Pending
//
//  The admin:
//    GET  /api/admin/deletion-requests               → the Pending queue
//    POST /api/admin/deletion-requests/{id}/approve  → DEACTIVATE the account (never a hard delete)
//    POST /api/admin/deletion-requests/{id}/reject   → keep the account          { reason? }
//
// Audit placement (build decision 3): these are ACCOUNT-level events. They are recorded in
// account_deletion_requests itself (who asked, when; who decided, when) and app-logged — not
// forced into the request-scoped audit_logs (same call as the 2FA and department events).
public static class AccountDeletionEndpoints
{
    private const string AdminRole = "System Administrator";

    public static void MapAccountDeletionEndpoints(this WebApplication app)
    {
        // ---------------- the user ----------------
        var me = app.MapGroup("/api/me/deletion-request").RequireAuthorization();

        me.MapGet("", async (ClaimsPrincipal principal, IAccountDeletionRepository deletions) =>
        {
            var latest = await deletions.GetLatestForUserAsync(CallerId(principal));
            return Results.Ok(latest is null ? null : new
            {
                deletionId = latest.DeletionId,
                status = latest.Status,
                reason = latest.Reason,
                requestedAt = latest.RequestedAt,
                decidedAt = latest.DecidedAt,
            });
        });

        me.MapPost("", async (
            DeletionRequestBody? body,
            ClaimsPrincipal principal,
            IUserRepository users,
            IAccountDeletionRepository deletions,
            ILoggerFactory loggerFactory) =>
        {
            var userId = CallerId(principal);
            var user = await users.GetByIdAsync(userId);
            if (user is null || !user.IsActive)
            {
                return Results.NotFound(new { error = "Account not found." });
            }

            // Last-admin guard, first check (build decision 1): the only active administrator
            // can't even ASK — there would be nobody left to run the system. (Re-checked at
            // approval time, inside the transaction, in case the admin count changed since.)
            if (user.Role == AdminRole && await users.CountActiveAdminsAsync() <= 1)
            {
                return Results.BadRequest(new
                {
                    error = "You are the only active System Administrator, so your account can't be deactivated. Make another user an administrator first.",
                });
            }

            var reason = Trimmed(body?.Reason, 1000);
            var created = await deletions.CreateAsync(userId, reason);
            if (created is null)
            {
                // The partial unique index: one Pending request per user.
                return Results.Conflict(new { error = "You already have a pending deletion request." });
            }

            loggerFactory.CreateLogger("Account.Deletion")
                .LogInformation("User {UserId} requested account deletion (request {DeletionId}).", userId, created.DeletionId);

            return Results.Created("/api/me/deletion-request", new
            {
                deletionId = created.DeletionId,
                status = created.Status,
                requestedAt = created.RequestedAt,
            });
        });

        me.MapPost("/cancel", async (
            ClaimsPrincipal principal,
            IAccountDeletionRepository deletions,
            ILoggerFactory loggerFactory) =>
        {
            var userId = CallerId(principal);
            if (!await deletions.CancelPendingAsync(userId))
            {
                return Results.Conflict(new { error = "You have no pending deletion request to cancel." });
            }
            loggerFactory.CreateLogger("Account.Deletion")
                .LogInformation("User {UserId} cancelled their account-deletion request.", userId);
            return Results.Ok(new { status = "Cancelled" });
        });

        // ---------------- the admin ----------------
        var admin = app.MapGroup("/api/admin/deletion-requests")
            .RequireAuthorization(policy => policy.RequireRole(AdminRole));

        admin.MapGet("", async (IAccountDeletionRepository deletions) =>
        {
            var pending = await deletions.GetPendingAsync();
            return Results.Ok(pending.Select(d => new
            {
                deletionId = d.DeletionId,
                userId = d.UserId,
                name = d.Name,
                email = d.Email,
                role = d.Role,
                department = d.Department,
                reason = d.Reason,
                requestedAt = d.RequestedAt,
            }));
        });

        admin.MapPost("/{id:int}/approve", async (
            int id,
            ClaimsPrincipal principal,
            IAccountDeletionRepository deletions,
            IEmailService email,
            ILoggerFactory loggerFactory) =>
        {
            var adminId = CallerId(principal);
            var request = await deletions.GetByIdAsync(id);
            if (request is null)
            {
                return Results.NotFound(new { error = "Deletion request not found." });
            }

            // Separation of duties (the A24 #2 idea): an admin doesn't approve the deactivation
            // of their own account — another administrator must.
            if (request.UserId == adminId)
            {
                return Results.Json(
                    new { error = "You cannot approve the deactivation of your own account. Another administrator must." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var outcome = await deletions.ApproveAsync(id, adminId);
            if (outcome == ApproveDeletionOutcome.NotPending)
            {
                return Results.Conflict(new { error = "This request is no longer pending." });
            }
            if (outcome == ApproveDeletionOutcome.LastAdmin)
            {
                return Results.Conflict(new
                {
                    error = "This is the last active System Administrator — the account can't be deactivated.",
                });
            }

            var logger = loggerFactory.CreateLogger("Account.Deletion");
            logger.LogInformation(
                "Admin {AdminId} approved deletion request {DeletionId}: user {UserId} DEACTIVATED (soft-delete; history kept).",
                adminId, id, request.UserId);

            // Confirmation email — best-effort (A21): the deactivation already happened.
            var sent = false;
            if (!string.IsNullOrWhiteSpace(request.Email))
            {
                sent = await email.SendAsync(
                    request.Email,
                    "Your Welfare Assistance account has been deactivated",
                    $"Hello {request.Name},\n\n" +
                    "Your request to delete your Welfare Assistance account has been approved, and the account " +
                    "has been deactivated. You can no longer sign in.\n\n" +
                    "For audit and legal record-keeping, the history of any assistance requests and decisions " +
                    "linked to your account is retained; it is no longer accessible through your account.\n\n" +
                    "If you did not ask for this, contact your administrator immediately.");
            }
            logger.LogInformation("Deactivation confirmation email to user {UserId}: {Result}.",
                request.UserId, sent ? "sent" : "NOT sent");

            return Results.Ok(new { deletionId = id, status = "Approved", userId = request.UserId, confirmationEmailSent = sent });
        });

        // C2 follow-up: undo a deactivation. Soft-delete makes this possible at all — nothing was
        // erased, so flipping is_active back restores the account exactly as it was (role,
        // department, 2FA setting, history). The original Approved request row stays as history;
        // the reactivation itself is an account-level event → app log (same as the rest of C2).
        app.MapPost("/api/admin/users/{userId:int}/reactivate", async (
            int userId,
            ClaimsPrincipal principal,
            IUserRepository users,
            IEmailService email,
            ILoggerFactory loggerFactory) =>
        {
            var user = await users.GetByIdAsync(userId);
            if (user is null)
            {
                return Results.NotFound(new { error = "User not found." });
            }
            if (!await users.ReactivateAsync(userId))
            {
                return Results.Conflict(new { error = "This account is already active." });
            }

            var adminId = CallerId(principal);
            var logger = loggerFactory.CreateLogger("Account.Deletion");
            logger.LogInformation("Admin {AdminId} REACTIVATED user {UserId}.", adminId, userId);

            // Best-effort heads-up to the owner (a security-relevant change to their account).
            var sent = !string.IsNullOrWhiteSpace(user.Email) && await email.SendAsync(
                user.Email,
                "Your Welfare Assistance account has been reactivated",
                $"Hello {user.Name},\n\nAn administrator has reactivated your Welfare Assistance account. " +
                "You can sign in again as before.\n\nIf you did not expect this, contact your administrator.");
            logger.LogInformation("Reactivation email to user {UserId}: {Result}.", userId, sent ? "sent" : "NOT sent");

            return Results.Ok(new { userId, isActive = true, notificationEmailSent = sent });
        })
        .RequireAuthorization(policy => policy.RequireRole(AdminRole));

        admin.MapPost("/{id:int}/reject", async (
            int id,
            DeletionRequestBody? body,
            ClaimsPrincipal principal,
            IAccountDeletionRepository deletions,
            ILoggerFactory loggerFactory) =>
        {
            var adminId = CallerId(principal);
            if (!await deletions.RejectAsync(id, adminId, Trimmed(body?.Reason, 1000)))
            {
                return Results.Conflict(new { error = "This request is no longer pending (or doesn't exist)." });
            }
            loggerFactory.CreateLogger("Account.Deletion")
                .LogInformation("Admin {AdminId} rejected deletion request {DeletionId}; the account stays active.", adminId, id);
            return Results.Ok(new { deletionId = id, status = "Rejected" });
        });
    }

    private static string? Trimmed(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var t = value.Trim();
        return t.Length > max ? t[..max] : t;
    }

    private static int CallerId(ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(raw, out var id) ? id : 0;
    }
}
