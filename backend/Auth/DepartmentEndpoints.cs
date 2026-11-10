using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using backend.Data;
using backend.Requests;

namespace backend.Auth;

// D1 — departments for signup and the "complete your profile" step.
//
//   GET /api/departments        (public)     → the departments a person can choose
//   GET /api/me/department      (signed in)  → { department, needsDepartment, canChoose }
//   PUT /api/me/department      (signed in)  → choose a department, ONE TIME, from "Unassigned"
//
// Admin list/create lives with the other admin endpoints (AdminEndpoints.cs).
public static class DepartmentEndpoints
{
    public static void MapDepartmentEndpoints(this WebApplication app)
    {
        // Public on purpose: the signup page needs the list before the person has an account.
        // "Unassigned" is left out — it's a placeholder state, not something you choose.
        app.MapGet("/api/departments", async (IDepartmentRepository departments) =>
        {
            var all = await departments.GetAllAsync();
            return Results.Ok(all
                .Where(d => d.Name != RoutingPolicy.UnassignedDepartment)
                .Select(d => d.Name));
        });

        var me = app.MapGroup("/api/me").RequireAuthorization();

        me.MapGet("/department", async (ClaimsPrincipal principal, IUserRepository users) =>
        {
            var user = await users.GetByIdAsync(CallerId(principal));
            if (user is null)
            {
                return Results.NotFound(new { error = "Account not found." });
            }
            var unassigned = user.Department == RoutingPolicy.UnassignedDepartment;
            return Results.Ok(new
            {
                department = user.Department,
                // Drives the complete-profile prompt: submitting is blocked until this is false.
                needsDepartment = unassigned,
                // Self-service is for Employees only (see PUT below).
                canChoose = unassigned && user.Role == "Employee",
            });
        });

        // ONE-TIME self-service. Why not let anyone change their department any time?
        //  - Tier-1 routing depends on it: an employee who could switch freely could route their
        //    request to whichever department's supervisor they preferred.
        //  - A supervisor who could switch would choose which department's queue they see.
        // So: only an EMPLOYEE, only while still "Unassigned", only once (conditional write).
        // Every later change — and every approver's department — is an admin action.
        me.MapPut("/department", async (
            ChooseDepartmentRequest request,
            ClaimsPrincipal principal,
            IUserRepository users,
            IDepartmentRepository departments,
            ILoggerFactory loggerFactory) =>
        {
            var userId = CallerId(principal);
            var user = await users.GetByIdAsync(userId);
            if (user is null)
            {
                return Results.NotFound(new { error = "Account not found." });
            }
            if (user.Role != "Employee")
            {
                return Results.Json(
                    new { error = "Approver and administrator departments are set by an administrator." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var name = request.Department?.Trim() ?? string.Empty;
            if (name.Length == 0 || name == RoutingPolicy.UnassignedDepartment || !await departments.ExistsAsync(name))
            {
                return Results.BadRequest(new { error = "Please choose a department from the list." });
            }

            if (!await users.SetDepartmentIfUnassignedAsync(userId, name))
            {
                return Results.Conflict(new
                {
                    error = "Your department is already set. Ask an administrator if it needs to change.",
                });
            }

            // Account-level event → app log (same reasoning as A2's 2FA enrol: audit_logs is
            // request-scoped; a dedicated account-security audit trail is future work).
            loggerFactory.CreateLogger("Profile.Department")
                .LogInformation("User {UserId} chose department '{Department}'.", userId, name);

            return Results.Ok(new { department = name, needsDepartment = false, canChoose = false });
        });
    }

    private static int CallerId(ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(raw, out var id) ? id : 0;
    }
}
