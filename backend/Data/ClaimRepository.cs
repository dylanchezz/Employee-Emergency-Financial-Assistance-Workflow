using Dapper;
using backend.Models;

namespace backend.Data;

public interface IClaimRepository
{
    // How many times this approver has already claimed this request (counts 'claim' events).
    Task<int> CountClaimsByApproverAsync(int requestId, int approverId);
    // Record a claim/release action and set/clear claimed_by in one transaction.
    Task ClaimAsync(int requestId, int approverId);
    Task ReleaseAsync(int requestId, int approverId);
    // How many times this request has been force-released by the escalation worker at a tier.
    Task<int> CountEscalateReleasesAsync(int requestId);
    // Force-release a claimed request (escalation): clear claimed_by, log an 'escalate_release' event.
    Task EscalateReleaseAsync(int requestId, int approverId);

    // Remove this approver's most recent 'claim' event for a request (used when a
    // deferral happens, so the defer-then-reclaim cycle doesn't consume the claim cap).
    Task RemoveLatestClaimAsync(int requestId, int approverId);
}

public class ClaimRepository : IClaimRepository
{
    private readonly IDbConnectionFactory _factory;

    public ClaimRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    public async Task<int> CountClaimsByApproverAsync(int requestId, int approverId)
    {
        const string sql = @"
            SELECT COUNT(*) FROM claim_events
            WHERE request_id = @RequestId
              AND approver_id = @ApproverId
              AND action = 'claim';";

        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(
            sql, new { RequestId = requestId, ApproverId = approverId });
    }

    // Set claimed_by and log the 'claim' event together, so the lock and its
    // history can never drift apart.
    public async Task ClaimAsync(int requestId, int approverId)
    {
        const string sql = @"
            UPDATE welfare_requests SET claimed_by = @ApproverId WHERE request_id = @RequestId;
            INSERT INTO claim_events (request_id, approver_id, action)
            VALUES (@RequestId, @ApproverId, 'claim');";

        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { RequestId = requestId, ApproverId = approverId });
    }
        public async Task RemoveLatestClaimAsync(int requestId, int approverId)
    {
        const string sql = @"
            DELETE FROM claim_events
            WHERE claim_event_id = (
                SELECT claim_event_id FROM claim_events
                WHERE request_id = @RequestId
                  AND approver_id = @ApproverId
                  AND action = 'claim'
                ORDER BY created_at DESC
                LIMIT 1
            );";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { RequestId = requestId, ApproverId = approverId });
    }

    // Clear claimed_by and log the 'release' event together.
    public async Task ReleaseAsync(int requestId, int approverId)
    {
        const string sql = @"
            UPDATE welfare_requests SET claimed_by = NULL WHERE request_id = @RequestId;
            INSERT INTO claim_events (request_id, approver_id, action)
            VALUES (@RequestId, @ApproverId, 'release');";

        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { RequestId = requestId, ApproverId = approverId });
    }
        public async Task<int> CountEscalateReleasesAsync(int requestId)
    {
        const string sql = @"
            SELECT COUNT(*) FROM claim_events
            WHERE request_id = @RequestId AND action = 'escalate_release';";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(sql, new { RequestId = requestId });
    }

    // Like ReleaseAsync, but logs the distinct 'escalate_release' action so the worker can
    // tell a forced (horizontal-escalation) release from a voluntary one and count them.
    public async Task EscalateReleaseAsync(int requestId, int approverId)
    {
        const string sql = @"
            UPDATE welfare_requests SET claimed_by = NULL WHERE request_id = @RequestId;
            INSERT INTO claim_events (request_id, approver_id, action)
            VALUES (@RequestId, @ApproverId, 'escalate_release');";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { RequestId = requestId, ApproverId = approverId });
    }
}