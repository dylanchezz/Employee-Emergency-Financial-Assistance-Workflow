using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using backend.Data;

namespace backend.Auth;

// Phase 6 (Part B, F3) — "who is active now" for a STATELESS-JWT app (no session store to ask).
// Build decision 1: update users.last_seen_at on authenticated requests, THROTTLED to at most once a
// minute per user (rejected: a heartbeat endpoint the AppShell pings — more moving parts, and it
// would count an idle open tab as "active"). The brief's rule: no DB write on every request.
public static class PresencePolicy
{
    // How recently someone must have made an authenticated call to count as "active now".
    public static readonly TimeSpan ActiveWindow = TimeSpan.FromMinutes(5);

    // At most one last_seen_at write per user per this interval.
    public static readonly TimeSpan TouchInterval = TimeSpan.FromMinutes(1);
}

public static class PresenceTracking
{
    // In-memory "when did we last write for this user" — the first throttle (no DB hit at all).
    // The UPDATE's own WHERE (AnalyticsRepository.TouchLastSeenAsync) is the second, for races and
    // restarts. Per-process memory is fine for a single-server prototype.
    private static readonly ConcurrentDictionary<int, DateTime> LastWrite = new();

    public static IApplicationBuilder UsePresenceTracking(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            // Read the caller BEFORE the endpoint runs: at this point context.User comes only from the
            // default "Bearer" scheme (the real app JWT). The 2FA endpoints later re-authenticate with
            // the PreAuth scheme and would replace context.User — reading it afterwards would count a
            // half-finished login as "active".
            var user = context.User;
            int? caller = null;
            if (user.Identity?.IsAuthenticated == true &&
                int.TryParse(user.FindFirstValue(JwtRegisteredClaimNames.Sub) ?? user.FindFirstValue(ClaimTypes.NameIdentifier), out var id))
            {
                caller = id;
            }

            await next();

            if (caller is not int userId) return;

            var now = DateTime.UtcNow;
            if (LastWrite.TryGetValue(userId, out var last) && now - last < PresencePolicy.TouchInterval) return;
            LastWrite[userId] = now;

            try
            {
                var analytics = context.RequestServices.GetRequiredService<IAnalyticsRepository>();
                await analytics.TouchLastSeenAsync(userId, PresencePolicy.TouchInterval);
            }
            catch (Exception ex)
            {
                // Presence is a convenience signal — never let it break a real request.
                context.RequestServices.GetRequiredService<ILoggerFactory>()
                    .CreateLogger("Presence").LogWarning(ex, "Could not update last_seen_at for user {UserId}.", userId);
            }
        });
}
