using Dapper;

namespace backend.Data;

// Phase 6 — read-only admin analytics (F3, F4, F5, F7, F8). Everything here only READS existing
// tables, except TouchLastSeenAsync (the F3 presence write, throttled — see PresenceTracking).
//
// Day bucketing: the database runs in Africa/Nairobi, and `::date` gives the LOCAL calendar day for
// both column types in use — TIMESTAMP (stored local) and TIMESTAMPTZ (converted to the session zone).

public record RoleDepartmentCount(string Role, string Department, int Active, int Deactivated);

public record DepartmentRequestCounts(string Department, int InReview, int Approved, int Disbursed,
    int Rejected, int Returned, int Deferred, int Total);

public record ActiveUser(int UserId, string Name, string Role, string Department, DateTime LastSeenAt);

// Day is DateOnly: Npgsql 10 returns a PostgreSQL `date` as DateOnly (found in testing — declaring it
// DateTime compiled fine but failed at runtime: Dapper couldn't find a matching constructor).
public record DailyAnalyticsRow(DateOnly Day, int Submitted, int FullyApproved, int Rejected, int Returned,
    int Deferred, int Disbursed, int DeletionRequests);

public record DailyUsageRow(DateOnly Day, int UsersWhoTookAnAction);

public interface IAnalyticsRepository
{
    Task<IEnumerable<RoleDepartmentCount>> GetUsersByRoleAndDepartmentAsync();          // F4
    Task<IEnumerable<DepartmentRequestCounts>> GetRequestsByDepartmentAsync();          // F5
    Task<IEnumerable<ActiveUser>> GetActiveUsersAsync(TimeSpan window);                 // F3
    Task TouchLastSeenAsync(int userId, TimeSpan minInterval);                          // F3 write
    Task<IEnumerable<DailyAnalyticsRow>> GetDailyAnalyticsAsync(int days);              // F7
    Task<IEnumerable<DailyUsageRow>> GetDailyUsageAsync(int days);                      // F8
}

public class AnalyticsRepository : IAnalyticsRepository
{
    private readonly IDbConnectionFactory _factory;

    public AnalyticsRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    // F4: users per (role, department), active and deactivated counted SEPARATELY (C2) so the
    // dashboard's numbers are honest about who can actually sign in.
    public async Task<IEnumerable<RoleDepartmentCount>> GetUsersByRoleAndDepartmentAsync()
    {
        const string sql = @"
            SELECT role       AS Role,
                   department AS Department,
                   COUNT(*) FILTER (WHERE is_active)::int     AS Active,
                   COUNT(*) FILTER (WHERE NOT is_active)::int AS Deactivated
            FROM users
            GROUP BY role, department
            ORDER BY role, department;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<RoleDepartmentCount>(sql);
    }

    // F5: per department (EVERY department, even with no requests), request counts by status.
    // A request belongs to its employee's CURRENT department (users.department, D1) — requests don't
    // store the department they were submitted from, so a moved employee's history moves with them.
    public async Task<IEnumerable<DepartmentRequestCounts>> GetRequestsByDepartmentAsync()
    {
        const string sql = @"
            SELECT d.name AS Department,
                   COUNT(r.request_id) FILTER (WHERE r.status = 'In Review')::int AS InReview,
                   COUNT(r.request_id) FILTER (WHERE r.status = 'Approved')::int  AS Approved,
                   COUNT(r.request_id) FILTER (WHERE r.status = 'Disbursed')::int AS Disbursed,
                   COUNT(r.request_id) FILTER (WHERE r.status = 'Rejected')::int  AS Rejected,
                   COUNT(r.request_id) FILTER (WHERE r.status = 'Returned')::int  AS Returned,
                   COUNT(r.request_id) FILTER (WHERE r.status = 'Deferred')::int  AS Deferred,
                   COUNT(r.request_id)::int                                        AS Total
            FROM departments d
            LEFT JOIN users u            ON u.department = d.name
            LEFT JOIN welfare_requests r ON r.user_id = u.user_id
            GROUP BY d.name
            ORDER BY d.name;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<DepartmentRequestCounts>(sql);
    }

    // F3: active accounts seen within the window. "Seen" = made an authenticated API call (the
    // throttled last_seen_at), so this is "active in the last N minutes", not live presence.
    public async Task<IEnumerable<ActiveUser>> GetActiveUsersAsync(TimeSpan window)
    {
        const string sql = @"
            SELECT user_id      AS UserId,
                   name         AS Name,
                   role         AS Role,
                   department   AS Department,
                   last_seen_at AS LastSeenAt
            FROM users
            WHERE is_active
              AND last_seen_at >= now() - (@Seconds * interval '1 second')
            ORDER BY last_seen_at DESC;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<ActiveUser>(sql, new { Seconds = (int)window.TotalSeconds });
    }

    // F3 write — CONDITIONAL, so even if two requests race past the in-memory throttle, the row is
    // only rewritten when it's older than minInterval (a cheap no-op UPDATE otherwise).
    public async Task TouchLastSeenAsync(int userId, TimeSpan minInterval)
    {
        const string sql = @"
            UPDATE users SET last_seen_at = now()
            WHERE user_id = @UserId
              AND (last_seen_at IS NULL OR last_seen_at < now() - (@Seconds * interval '1 second'));";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { UserId = userId, Seconds = (int)minInterval.TotalSeconds });
    }

    // F7 — one row per day for the last N days (zeros included). Build decision 3, column sources:
    //   submitted        welfare_requests.created_at          (complete — every request has one)
    //   fully_approved   approvals: decision 'Approved' at tier 4 (HR) — decided_at
    //   rejected         approvals 'Rejected' (an approver)  +  audit_logs system rejections
    //                    ('Rejected at validation…', 'Rejected again at validation…', 'Auto-rejected…')
    //   returned         approvals 'Returned' (an approver)  +  audit_logs 'Returned at validation…' /
    //                    'Returned again at validation…'
    //   deferred         audit_logs 'Deferred at Finance…'    (no dated deferral table exists)
    //   disbursed        disbursements.disbursed_at           (D2)
    //   deletion_requests account_deletion_requests.requested_at (C2)
    // Entity tables are preferred where they exist: audit_logs only started with Feature 10, so older
    // events have no audit row. The audit-text columns depend on wording our own code writes.
    public async Task<IEnumerable<DailyAnalyticsRow>> GetDailyAnalyticsAsync(int days)
    {
        const string sql = @"
            WITH days AS (
                SELECT generate_series(current_date - (@Days - 1), current_date, interval '1 day')::date AS day
            )
            SELECT d.day AS Day,
                   (SELECT COUNT(*) FROM welfare_requests w WHERE w.created_at::date = d.day)::int AS Submitted,
                   (SELECT COUNT(*) FROM approvals a
                     WHERE a.decision = 'Approved' AND a.tier = 4 AND a.decided_at::date = d.day)::int AS FullyApproved,
                   ((SELECT COUNT(*) FROM approvals a WHERE a.decision = 'Rejected' AND a.decided_at::date = d.day)
                    + (SELECT COUNT(*) FROM audit_logs l WHERE l.logged_at::date = d.day
                        AND (l.action LIKE 'Rejected at validation%' OR l.action LIKE 'Rejected again at validation%'
                             OR l.action LIKE 'Auto-rejected%')))::int AS Rejected,
                   ((SELECT COUNT(*) FROM approvals a WHERE a.decision = 'Returned' AND a.decided_at::date = d.day)
                    + (SELECT COUNT(*) FROM audit_logs l WHERE l.logged_at::date = d.day
                        AND (l.action LIKE 'Returned at validation%' OR l.action LIKE 'Returned again at validation%')))::int AS Returned,
                   (SELECT COUNT(*) FROM audit_logs l
                     WHERE l.logged_at::date = d.day AND l.action LIKE 'Deferred at Finance%')::int AS Deferred,
                   (SELECT COUNT(*) FROM disbursements x WHERE x.disbursed_at::date = d.day)::int AS Disbursed,
                   (SELECT COUNT(*) FROM account_deletion_requests k WHERE k.requested_at::date = d.day)::int AS DeletionRequests
            FROM days d
            ORDER BY d.day;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<DailyAnalyticsRow>(sql, new { Days = days });
    }

    // F8 — distinct users who TOOK AN ACTION each day (distinct non-null audit_logs.actor_id). An honest
    // proxy for "daily usage": last_seen_at is a single point in time and can't give history, and a
    // user who only browsed leaves no audit row.
    public async Task<IEnumerable<DailyUsageRow>> GetDailyUsageAsync(int days)
    {
        const string sql = @"
            WITH days AS (
                SELECT generate_series(current_date - (@Days - 1), current_date, interval '1 day')::date AS day
            )
            SELECT d.day AS Day,
                   (SELECT COUNT(DISTINCT l.actor_id) FROM audit_logs l
                     WHERE l.actor_id IS NOT NULL AND l.logged_at::date = d.day)::int AS UsersWhoTookAnAction
            FROM days d
            ORDER BY d.day;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<DailyUsageRow>(sql, new { Days = days });
    }
}
