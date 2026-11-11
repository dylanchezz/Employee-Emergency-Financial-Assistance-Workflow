using backend.Data;

namespace backend.Auth;

// Phase 6 — admin analytics + downloads. Same gate as every other admin endpoint (A19):
// RequireRole("System Administrator").
//
//  Part A   GET /api/admin/requests/{id}/audit                  (F2)  one request's audit trail (JSON)
//           GET /api/admin/analytics/users                      (F4)  users by role → department
//           GET /api/admin/analytics/requests-by-department     (F5)  request counts by status, per department
//  Part B   GET /api/admin/analytics/active-users               (F3)  active in the last 5 minutes
//  Part C   GET /api/admin/requests/{id}/audit.csv              (F6)  that trail as CSV
//           GET /api/admin/analytics/daily.csv?days=30          (F7)  daily lifecycle counts
//           GET /api/admin/analytics/usage.csv?days=30          (F8)  users who took an action, per day
public static class AdminAnalyticsEndpoints
{
    private const int DefaultDays = 30;
    private const int MaxDays = 366;

    public static void MapAdminAnalyticsEndpoints(this WebApplication app)
    {
        var admin = app.MapGroup("/api/admin").RequireAuthorization(p => p.RequireRole("System Administrator"));

        // ---------- Part A ----------

        admin.MapGet("/requests/{id:int}/audit", async (int id, IAuditRepository audit) =>
            Results.Ok((await audit.GetForRequestAsync(id)).Select(e => new
            {
                e.LogId,
                e.LoggedAt,
                actor = e.ActorName ?? "System",   // actor_id NULL = a system action (A20)
                e.Action,
            })));

        admin.MapGet("/analytics/users", async (IAnalyticsRepository analytics) =>
        {
            var rows = (await analytics.GetUsersByRoleAndDepartmentAsync()).ToList();
            var byRole = rows.GroupBy(r => r.Role).Select(g => new
            {
                role = g.Key,
                active = g.Sum(r => r.Active),
                deactivated = g.Sum(r => r.Deactivated),   // shown separately — not in "active" (C2)
                departments = g.Select(r => new { department = r.Department, active = r.Active, deactivated = r.Deactivated }),
            });
            return Results.Ok(new
            {
                totalActive = rows.Sum(r => r.Active),
                totalDeactivated = rows.Sum(r => r.Deactivated),
                roles = byRole,
            });
        });

        admin.MapGet("/analytics/requests-by-department", async (IAnalyticsRepository analytics) =>
            Results.Ok(await analytics.GetRequestsByDepartmentAsync()));

        // ---------- Part B ----------

        admin.MapGet("/analytics/active-users", async (IAnalyticsRepository analytics) =>
        {
            var users = (await analytics.GetActiveUsersAsync(PresencePolicy.ActiveWindow)).ToList();
            return Results.Ok(new
            {
                windowMinutes = (int)PresencePolicy.ActiveWindow.TotalMinutes,
                // Honest label (the brief): last authenticated call within the window, not live presence.
                definition = $"Signed-in users who used the app in the last {(int)PresencePolicy.ActiveWindow.TotalMinutes} minutes.",
                count = users.Count,
                users,
            });
        });

        // ---------- Part C (CSV — build decision 2) ----------

        admin.MapGet("/requests/{id:int}/audit.csv", async (int id, IAuditRepository audit) =>
        {
            var rows = await audit.GetForRequestAsync(id);
            var csv = Csv.Build(
                new[] { "logged_at", "actor", "action" },
                rows.Select(e => new object?[] { e.LoggedAt, e.ActorName ?? "System", e.Action }));
            return Csv.File(csv, $"request-{id}-audit.csv");
        });

        admin.MapGet("/analytics/daily.csv", async (int? days, IAnalyticsRepository analytics) =>
        {
            var n = Math.Clamp(days ?? DefaultDays, 1, MaxDays);
            var rows = await analytics.GetDailyAnalyticsAsync(n);
            var csv = Csv.Build(
                new[] { "date", "submitted", "fully_approved", "rejected", "returned", "deferred", "disbursed", "deletion_requests" },
                rows.Select(r => new object?[] { r.Day, r.Submitted, r.FullyApproved, r.Rejected, r.Returned, r.Deferred, r.Disbursed, r.DeletionRequests }));
            return Csv.File(csv, $"daily-analytics-last-{n}-days.csv");
        });

        admin.MapGet("/analytics/usage.csv", async (int? days, IAnalyticsRepository analytics) =>
        {
            var n = Math.Clamp(days ?? DefaultDays, 1, MaxDays);
            var rows = await analytics.GetDailyUsageAsync(n);
            // The column name carries the honesty: it's "users who took an action", a proxy for usage.
            var csv = Csv.Build(
                new[] { "date", "users_who_took_an_action" },
                rows.Select(r => new object?[] { r.Day, r.UsersWhoTookAnAction }));
            return Csv.File(csv, $"daily-usage-last-{n}-days.csv");
        });
    }
}
