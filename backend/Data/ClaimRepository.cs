using Dapper;
using backend.Models;

namespace backend.Data;

public interface IClaimRepository
{
    // How many times this approver has already claimed this request (counts 'claim' events).
    Task<int> CountClaimsByApproverAsync(int requestId, int approverId);
    // Record a claim/release action and set/clear claimed_by in one transaction.
    // ClaimAsync returns false if another officer took the request first (lost the race).
    Task<bool> ClaimAsync(int requestId, int approverId);
    Task PreAssignAsync(int requestId, int approverId);
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
    //
    // The UPDATE is CONDITIONAL: it only takes the request if it is still unclaimed (or
    // already held by this same approver). This closes the check-then-act race — the
    // endpoint checks "unclaimed" first, but two approvers can both pass that check at
    // the same instant. Postgres row-locks the UPDATE, so the second one waits, then
    // re-checks the WHERE against the winner's write, matches 0 rows, and gets nothing.
    // The claim event is only inserted for a row the UPDATE actually took (the CTE),
    // so a lost race leaves no stray 'claim' event (and doesn't eat into the cap).
    // Returns true if this approver now holds the request, false if they lost the race.
    public async Task<bool> ClaimAsync(int requestId, int approverId)
    {
        const string sql = @"
            WITH taken AS (
                UPDATE welfare_requests
                SET claimed_by = @ApproverId
                WHERE request_id = @RequestId
                  AND (claimed_by IS NULL OR claimed_by = @ApproverId)
                RETURNING request_id
            )
            INSERT INTO claim_events (request_id, approver_id, action)
            SELECT request_id, @ApproverId, 'claim' FROM taken;";

        using var connection = _factory.CreateConnection();
        var rowsInserted = await connection.ExecuteAsync(
            sql, new { RequestId = requestId, ApproverId = approverId });
        return rowsInserted == 1;
    }
    // Pre-assign a request to an approver WITHOUT logging a claim event. Used when a
    // resubmitted request goes back to the officer who returned it: they're continuing
    // earlier work, so it shouldn't count against their per-request claim cap. They can
    // act on it immediately (claimed_by is set) or release it like any claim.
    public async Task PreAssignAsync(int requestId, int approverId)
    {
        const string sql = @"
            UPDATE welfare_requests SET claimed_by = @ApproverId WHERE request_id = @RequestId;";
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