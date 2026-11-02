using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using backend.Data;

namespace backend.Requests;

public static class NotificationEndpoints
{
    public static void MapNotificationEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/notifications");

        // Small helper: read the caller's user id from the token.
        static int? CallerId(ClaimsPrincipal principal)
        {
            var idClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(idClaim, out var id) ? id : null;
        }

        // The caller's own notifications (newest first, in-system).
        group.MapGet("/", async (
            ClaimsPrincipal principal,
            INotificationRepository notifications) =>
        {
            var userId = CallerId(principal);
            if (userId is null) return Results.Unauthorized();

            var mine = await notifications.GetForUserAsync(userId.Value);
            return Results.Ok(mine);
        })
        .RequireAuthorization();

        // The caller's unread count (for the bell badge).
        group.MapGet("/unread-count", async (
            ClaimsPrincipal principal,
            INotificationRepository notifications) =>
        {
            var userId = CallerId(principal);
            if (userId is null) return Results.Unauthorized();

            var count = await notifications.CountUnreadAsync(userId.Value);
            return Results.Ok(new { unread = count });
        })
        .RequireAuthorization();

        // Mark one notification read (scoped to the owner inside the repository).
        group.MapPost("/{id:int}/read", async (
            int id,
            ClaimsPrincipal principal,
            INotificationRepository notifications) =>
        {
            var userId = CallerId(principal);
            if (userId is null) return Results.Unauthorized();

            await notifications.MarkReadAsync(id, userId.Value);
            return Results.Ok(new { notificationId = id, read = true });
        })
        .RequireAuthorization();

        // Mark all the caller's notifications read.
        group.MapPost("/read-all", async (
            ClaimsPrincipal principal,
            INotificationRepository notifications) =>
        {
            var userId = CallerId(principal);
            if (userId is null) return Results.Unauthorized();

            await notifications.MarkAllReadAsync(userId.Value);
            return Results.Ok(new { read = true });
        })
        .RequireAuthorization();
    }
}