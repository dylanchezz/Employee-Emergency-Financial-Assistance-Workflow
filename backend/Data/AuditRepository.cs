using backend.Models;
using Dapper;

namespace backend.Data;

public interface IAuditRepository
{
    Task LogAsync(int requestId, int? actorId, string action);
    Task<IEnumerable<AuditEntry>> GetRecentAsync(int limit);
    // Has this exact action already been logged for this request? (Used by the escalation
    // worker to tell the FIRST HR-overdue alert from a repeat.)
    Task<bool> HasActionAsync(int requestId, string action);

    // Phase 6 (F2 / F6): one request's whole trail, oldest first, with actor names.
    Task<IEnumerable<AuditEntry>> GetForRequestAsync(int requestId);
}

public class AuditRepository : IAuditRepository
{
    private readonly IDbConnectionFactory _factory;

    public AuditRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    // Write one audit entry. actorId is nullable: a system action (e.g. an automatic
    // escalation or a validation outcome with no human actor) logs actor_id = NULL.
    public async Task LogAsync(int requestId, int? actorId, string action)
    {
        const string sql = @"
            INSERT INTO audit_logs (request_id, actor_id, action)
            VALUES (@RequestId, @ActorId, @Action);";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(
            sql, new { RequestId = requestId, ActorId = actorId, Action = action });
    }

    // Recent audit entries across all requests, newest first, with the actor's name
    // (null for system actions) — for the admin activity view.
    public async Task<IEnumerable<AuditEntry>> GetRecentAsync(int limit)
    {
        const string sql = @"
            SELECT a.log_id     AS LogId,
                   a.request_id AS RequestId,
                   a.actor_id   AS ActorId,
                   u.name       AS ActorName,
                   a.action     AS Action,
                   a.logged_at  AS LoggedAt
            FROM audit_logs a
            LEFT JOIN users u ON u.user_id = a.actor_id
            ORDER BY a.logged_at DESC, a.log_id DESC
            LIMIT @Limit;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<AuditEntry>(sql, new { Limit = limit });
    }

    public async Task<bool> HasActionAsync(int requestId, string action)
    {
        const string sql = @"
            SELECT EXISTS (
                SELECT 1 FROM audit_logs
                WHERE request_id = @RequestId AND action = @Action
            );";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<bool>(
            sql, new { RequestId = requestId, Action = action });
    }

    public async Task<IEnumerable<AuditEntry>> GetForRequestAsync(int requestId)
    {
        const string sql = @"
            SELECT a.log_id     AS LogId,
                   a.request_id AS RequestId,
                   a.actor_id   AS ActorId,
                   u.name       AS ActorName,
                   a.action     AS Action,
                   a.logged_at  AS LoggedAt
            FROM audit_logs a
            LEFT JOIN users u ON u.user_id = a.actor_id
            WHERE a.request_id = @RequestId
            ORDER BY a.logged_at ASC, a.log_id ASC;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<AuditEntry>(sql, new { RequestId = requestId });
    }
}