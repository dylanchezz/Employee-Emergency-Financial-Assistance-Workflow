using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using backend.Data;
using backend.Models;
using backend.Requests;

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
                // Admin nudges the officer responsible for a stuck request (from the "Needs attention"
        // list). Sends a reminder email to the claiming officer. Admin-gated (whole group).
        group.MapPost("/attention/{id:int}/nudge", async (
            int id,
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IUserRepository users,
            IEmailService email,
            IAuditRepository audit) =>
        {
            var request = await requests.GetByIdAsync(id);
            if (request is null)
            {
                return Results.NotFound(new { error = "Request not found." });
            }
            if (request.ClaimedBy is null)
            {
                return Results.BadRequest(new { error = "No officer currently holds this request, so there is no one to remind." });
            }

            var contact = await users.GetContactByIdAsync(request.ClaimedBy.Value);
            if (contact is null || string.IsNullOrWhiteSpace(contact.Value.Email))
            {
                return Results.BadRequest(new { error = "The responsible officer has no email on file." });
            }

            var body =
                $"Reminder: request #{id} is awaiting your decision and has passed its response window. " +
                "Please review and action it as soon as possible.";
            var sent = await email.SendAsync(contact.Value.Email, $"Reminder: please action request #{id}", body);

            // Record the nudge in the audit trail (the admin is the actor).
            var adminIdClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            int.TryParse(adminIdClaim, out var adminId);
            await audit.LogAsync(id, adminId == 0 ? null : adminId,
                $"Admin sent a reminder email to {contact.Value.Name} about this stuck request.");

            return sent
                ? Results.Ok(new { message = $"Reminder sent to {contact.Value.Name} ({contact.Value.Email})." })
                : Results.Ok(new { message = "Could not send the reminder email (email may be disabled or the server unreachable)." });
        });
        // Recent audit entries across all requests (newest first), for the admin activity view.
        group.MapGet("/audit", async (IAuditRepository audit) =>
        {
            var entries = await audit.GetRecentAsync(100);
            return Results.Ok(entries);
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
                // C2: deactivated accounts stay listed (history kept) — the UI marks them.
                isActive = u.IsActive,
                deactivatedAt = u.DeactivatedAt,
            });
            return Results.Ok(list);
        });

        // Create a user with any role (so an admin can make approver/admin accounts).
        group.MapPost("/users", async (
            CreateUserRequest request,
            IUserRepository users,
            IDepartmentRepository departments) =>
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

            // D1: department is required in the DB (FK + NOT NULL). Blank → "Unassigned" (the
            // admin can set it later); anything else must be a real department — checked here so
            // a typo is a clean 400, not a foreign-key error.
            var department = string.IsNullOrWhiteSpace(request.Department)
                ? backend.Requests.RoutingPolicy.UnassignedDepartment
                : request.Department.Trim();
            if (!await departments.ExistsAsync(department))
            {
                return Results.BadRequest(new { error = $"Unknown department '{department}'. Create it first." });
            }

            var user = new User
            {
                Name = request.Name,
                Email = request.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Role = request.Role,
                Department = department,
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

        // ---- D1: departments (minimal management: list + create) ----

        // All departments, including "Unassigned", with how many users each has.
        group.MapGet("/departments", async (IDepartmentRepository departments) =>
            Results.Ok(await departments.GetAllAsync()));

        group.MapPost("/departments", async (
            CreateDepartmentRequest request,
            IDepartmentRepository departments) =>
        {
            var name = request.Name?.Trim() ?? string.Empty;
            if (name.Length == 0 || name.Length > 100)
            {
                return Results.BadRequest(new { error = "A department name (1–100 characters) is required." });
            }
            var created = await departments.CreateAsync(name);
            return created is null
                ? Results.Conflict(new { error = $"A department called '{name}' already exists." })
                : Results.Created($"/api/admin/departments/{created.DepartmentId}", created);
        });

        // Set any user's department. This is how approvers get placed (a supervisor's department
        // decides which tier-1 queue they see) and how a wrong self-service choice is corrected —
        // users can only choose once themselves (see DepartmentEndpoints).
        group.MapPut("/users/{id:int}/department", async (
            int id,
            ChooseDepartmentRequest request,
            IUserRepository users,
            IDepartmentRepository departments) =>
        {
            var name = request.Department?.Trim() ?? string.Empty;
            if (name.Length == 0 || !await departments.ExistsAsync(name))
            {
                return Results.BadRequest(new { error = "Choose an existing department." });
            }
            if (!await users.SetDepartmentAsync(id, name))
            {
                return Results.NotFound(new { error = "User not found." });
            }
            return Results.Ok(new { userId = id, department = name });
        });
    }
}