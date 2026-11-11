using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using backend.Data;
using backend.Requests;

namespace backend.Auth;

// Phase 3 — the Profile screen's backend (C1 + A6).
//   GET  /api/me                   → the signed-in user's profile basics
//   POST /api/me/change-password   → { currentPassword, newPassword }
// (Department self-service lives in DepartmentEndpoints; deletion in AccountDeletionEndpoints;
//  2FA in TwoFactorEndpoints — Profile just brings their UI together.)
public static class ProfileEndpoints
{
    public static void MapProfileEndpoints(this WebApplication app)
    {
        var me = app.MapGroup("/api/me").RequireAuthorization();

        me.MapGet("", async (ClaimsPrincipal principal, IUserRepository users) =>
        {
            var user = await users.GetByIdAsync(CallerId(principal));
            if (user is null)
            {
                return Results.NotFound(new { error = "Account not found." });
            }
            // Never the hash — only whether a password exists (drives the change-password section).
            return Results.Ok(new
            {
                userId = user.UserId,
                name = user.Name,
                email = user.Email,
                role = user.Role,
                department = user.Department,
                createdAt = user.CreatedAt,
                hasPassword = user.PasswordHash is not null,
                signInMethod = user.OAuthProvider is null ? "password" : user.OAuthProvider,
                twoFactorEnabled = user.TwoFactorEnabled,
            });
        });

        // Phase 5 (E1): the caller's request frequency + remaining annual allowance.
        // Build decision 1: computed by the SAME code rule 3 enforces — ValidationService's constant
        // (MaxRequestsPerYear), its window (AnnualWindowStart) and its count
        // (CountTowardAnnualLimitAsync) — never a hard-coded number or a re-implemented count.
        me.MapGet("/request-stats", async (
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IValidationService validation) =>
        {
            var userId = CallerId(principal);
            var windowStart = ValidationService.AnnualWindowStart();

            var allTime = await requests.CountByUserAsync(userId);
            var last12Months = await requests.CountByUserSinceAsync(userId, windowStart);
            var counted = await validation.CountTowardAnnualLimitAsync(userId);   // non-rejected, as the rule counts
            var limit = ValidationService.MaxRequestsPerYear;
            var remaining = Math.Max(0, limit - counted);

            // When the allowance is used up, say when the next request becomes possible: the oldest
            // counted request drops out of the rolling window one year after it was made.
            DateTime? nextSlotOpensAt = null;
            if (remaining == 0)
            {
                var oldest = await requests.GetOldestNonRejectedSinceAsync(userId, windowStart);
                nextSlotOpensAt = oldest?.AddYears(1);
            }

            return Results.Ok(new
            {
                allTime,
                last12Months,
                countedTowardLimit = counted,   // rejected requests don't use up the allowance
                annualLimit = limit,
                remainingAllowance = remaining,
                nextSlotOpensAt,
            });
        });

        me.MapPost("/change-password", async (
            ChangePasswordRequest request,
            ClaimsPrincipal principal,
            IUserRepository users,
            IEmailService email,
            ILoggerFactory loggerFactory) =>
        {
            var userId = CallerId(principal);
            var user = await users.GetByIdAsync(userId);
            if (user is null || !user.IsActive)
            {
                return Results.NotFound(new { error = "Account not found." });
            }

            // Guard 1: password accounts only (A27's idea) — a Google-only account has no password
            // to change, and this endpoint must never ADD one (that would create a second way in).
            if (user.PasswordHash is null)
            {
                return Results.BadRequest(new { error = "This account signs in with Google, so it has no password to change." });
            }

            // Guard 2: prove it's really the owner — the current password, checked with BCrypt.
            // (A stolen-but-valid JWT alone can't take over the account by changing the password.)
            if (string.IsNullOrEmpty(request.CurrentPassword) ||
                !BCrypt.Net.BCrypt.Verify(request.CurrentPassword, user.PasswordHash))
            {
                return Results.BadRequest(new { error = "Your current password is incorrect." });
            }

            // Guard 3: the shared strength rule, and an actual change.
            if (PasswordPolicy.Problem(request.NewPassword) is { } problem)
            {
                return Results.BadRequest(new { error = problem });
            }
            if (BCrypt.Net.BCrypt.Verify(request.NewPassword, user.PasswordHash))
            {
                return Results.BadRequest(new { error = "The new password must be different from your current one." });
            }

            if (!await users.SetPasswordHashAsync(userId, BCrypt.Net.BCrypt.HashPassword(request.NewPassword)))
            {
                return Results.BadRequest(new { error = "The password could not be changed." });
            }

            // Account-level event → app log (same call as 2FA / department / deletion events).
            var logger = loggerFactory.CreateLogger("Account.Password");
            logger.LogInformation("User {UserId} changed their password.", userId);

            // Security notice (the A2 2FA-notice pattern): best-effort, the change already happened.
            // Its value is reaching the REAL owner if someone else changed it.
            var sent = await email.SendAsync(
                user.Email,
                "Security notice: your password was changed",
                $"Hello {user.Name},\n\nThe password for your Employee Welfare Portal account was changed at " +
                $"{DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC.\n\nIf you did not do this, contact your administrator immediately.");
            logger.LogInformation("Password-change notice to user {UserId}: {Result}.", userId, sent ? "sent" : "NOT sent");

            // Caveat (A4, same as C2): JWTs are stateless — sessions already signed in elsewhere stay
            // valid until their token expires (≤120 min). No forced global sign-out (future work).
            return Results.Ok(new { changed = true, noticeEmailSent = sent });
        });
    }

    private static int CallerId(ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(raw, out var id) ? id : 0;
    }
}
