using System.Security.Claims;
using backend.Models;

namespace backend.Auth;

public static class ProtectedTestEndpoints
{
    public static void MapProtectedTestEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/test");

        //Any authenticated user with a  valid token can reach this
        group.MapGet("/me", (ClaimsPrincipal user) =>
        {
            var name = user.FindFirstValue(ClaimTypes.Name);
            var email = user.FindFirstValue(ClaimTypes.Email);
            var role = user.FindFirstValue(ClaimTypes.Role);

            return Results.Ok(new {name, email, role});
        })
        .RequireAuthorization();

        //Onlu users with trh role "Welfare Officer" can get this
        group.MapGet("/welfare-only", () =>
        {
            return Results.Ok(new { message = "You reached a Welfare Officer only endpoint"});

        })
        .RequireAuthorization(policy => policy.RequireRole("Welfare Officer"));
    }
}