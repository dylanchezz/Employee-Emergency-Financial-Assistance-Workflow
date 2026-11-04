using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using backend.Data;
using backend.Models;

namespace backend.Auth;

public static class AdminEndpoints
{
    // The six roles the schema's CHECK constraint allows. The admin UI offers exactly these,
    // and the backend validates against this set so a bad value is a clean 400, not a DB error.
    private static readonly string[] ValidRoles =
    {
        "Employee",
        "Department Supervisor",
        "Welfare Officer",
        "Finance Officer",
        "HR Manager",
        "System Administrator",
    };

    public static void MapAdminEndpoints(this WebApplication app)
    {
        // Every endpoint in this group requires the caller to be a System Administrator.
        var group = app.MapGroup("/api/admin")
            .RequireAuthorization(policy => policy.RequireRole("System Administrator"));
                    // The current validation-rule thresholds, read from the ValidationService constants
        // (one source of truth). Read-only — editing rules at runtime is future work.
        group.MapGet("/rules", () =>
        {
            var rules = new[]
            {
                new
                {
                    name = "Maximum request amount",
                    value = $"{backend.Requests.ValidationService.SalaryMultiplierCap}× gross salary",
                    effect = "A request above this is flagged for approver review (not auto-blocked).",
                },
                new
                {
                    name = "Minimum employment duration",
                    value = $"{backend.Requests.ValidationService.MinEmploymentMonths} months",
                    effect = "Under this, the request is flagged for approver review.",
                },
                new
                {
                    name = "Annual request limit",
                    value = $"{backend.Requests.ValidationService.MaxRequestsPerYear} requests / 12 months",
                    effect = "Reaching this limit auto-rejects a new request (hard block).",
                },
                new
                {
                    name = "Duplicate-request window",
                    value = $"{backend.Requests.ValidationService.DuplicateWindowDays} days",
                    effect = "A same-category request within this window is returned to confirm it isn't a duplicate.",
                },
            };
            return Results.Ok(rules);
        });

        // Requests currently needing admin follow-up: stuck at HR past the response window,
        // or deferred too long. Same cutoffs as the escalation worker (one source of truth).
        group.MapGet("/attention", async (IWelfareRequestRepository requests) =>
        {
            var now = DateTime.UtcNow;
            // HR-stuck requests are identified by a recorded escalation (stable), not a live
            // cutoff; only the deferred window is time-based here.
            var deferredCutoff = now - backend.Requests.EscalationPolicy.DeferredTimeout;
            var items = await requests.GetNeedingAdminAttentionAsync(DateTime.UtcNow, deferredCutoff);
            return Results.Ok(items);
        });

        // List all users (no password hashes) for the management table.
        group.MapGet("/users", async (IUserRepository users) =>
        {
            var all = await users.GetAllAsync();
            // Shape the response explicitly — never leak the password hash.
            var list = all.Select(u => new
            {
                userId = u.UserId,
                name = u.Name,
                email = u.Email,
                role = u.Role,
                department = u.Department,
                createdAt = u.CreatedAt,
            });
            return Results.Ok(list);
        });

        // Create a user with any role (so an admin can make approver/admin accounts).
        group.MapPost("/users", async (
            CreateUserRequest request,
            IUserRepository users) =>
        {
            if (string.IsNullOrWhiteSpace(request.Name) ||
                string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password) ||
                string.IsNullOrWhiteSpace(request.Role))
            {
                return Results.BadRequest(new { error = "Name, email, password, and role are required." });
            }
            if (!ValidRoles.Contains(request.Role))
            {
                return Results.BadRequest(new { error = "Invalid role." });
            }

            var existing = await users.GetByEmailAsync(request.Email);
            if (existing is not null)
            {
                return Results.Conflict(new { error = "An account with this email already exists." });
            }

            var user = new User
            {
                Name = request.Name,
                Email = request.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Role = request.Role,
                Department = request.Department,
            };
            var newId = await users.CreateAsync(user);
            return Results.Created($"/api/admin/users/{newId}",
                new { userId = newId, email = user.Email, role = user.Role });
        });

        // Change a user's role.
        group.MapPut("/users/{id:int}/role", async (
            int id,
            ChangeRoleRequest request,
            ClaimsPrincipal principal,
            IUserRepository users) =>
        {
            if (string.IsNullOrWhiteSpace(request.Role) || !ValidRoles.Contains(request.Role))
            {
                return Results.BadRequest(new { error = "A valid role is required." });
            }

            // Guard: an admin cannot demote themselves (prevents locking the last admin out).
            var callerIdClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (int.TryParse(callerIdClaim, out var callerId)
                && callerId == id
                && request.Role != "System Administrator")
            {
                return Results.BadRequest(new { error = "You cannot change your own administrator role." });
            }

            await users.UpdateRoleAsync(id, request.Role);
            return Results.Ok(new { userId = id, role = request.Role });
        });
    }
}