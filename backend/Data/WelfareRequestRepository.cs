using backend.Models;
using Dapper;
using backend.Requests;

namespace backend.Data;

public interface IWelfareRequestRepository
{
    Task<int> CreateAsync(WelfareRequest request);
    Task<WelfareRequest?> GetByIdAsync(int requestId);
    Task<int> CountByUserAsync(int userId);
    Task<int> CountByUserSinceAsync(int userId, DateTime since);
    Task<bool> HasRecentSimilarAsync(int userId, string category, DateTime since);
    Task<int> CountNonRejectedByUserSinceAsync(int userId, DateTime since);
    Task<IEnumerable<QueueItemDto>> GetQueueForTierAsync(int tier, int approverId);
    Task UpdateStatusAndTierAsync(int requestId, string status, int currentTier);
    Task<IEnumerable<QueueItemDto>> GetByUserAsync(int userId);
    Task SetDeferReasonAsync(int requestId, string reason);
    Task<IEnumerable<WelfareRequest>> GetOverdueInReviewAsync(DateTime cutoffUtc);
    Task<IEnumerable<WelfareRequest>> GetOverdueReturnedAsync(DateTime cutoffUtc);
    Task<IEnumerable<WelfareRequest>> GetOverdueDeferredAsync(DateTime cutoffUtc);
    Task RecordEscalationAsync(int requestId, int tier);
}

public class WelfareRequestRepository : IWelfareRequestRepository
{
    private readonly IDbConnectionFactory _factory;

    public WelfareRequestRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    public async Task<int> CreateAsync(WelfareRequest request)
    {
        const string sql = @"
            INSERT INTO welfare_requests
                (user_id, category, amount, description, salary, employment_duration_months,
                 previous_requests, request_frequency, has_documents, status, current_tier, validation_note)
            VALUES
                (@UserId, @Category, @Amount, @Description,
                 @Salary, @EmploymentDurationMonths, @PreviousRequests,
                 @RequestFrequency, @HasDocuments, @Status, @CurrentTier, @ValidationNote)
            RETURNING request_id;";

        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(sql, request);
    }

    public async Task<WelfareRequest?> GetByIdAsync(int requestId)
    {
        const string sql = @"
            SELECT request_id                 AS RequestId,
                   user_id                    AS UserId,
                   category                   AS Category,
                   amount                     AS Amount,
                   description                AS Description,
                   salary                     AS Salary,
                   employment_duration_months AS EmploymentDurationMonths,
                   previous_requests          AS PreviousRequests,
                   request_frequency          AS RequestFrequency,
                   has_documents              AS HasDocuments,
                   status                     AS Status,
                   current_tier               AS CurrentTier,
                   claimed_by                 AS ClaimedBy,
                   defer_reason               AS DeferReason,
                   validation_note            AS ValidationNote,
                   created_at                 AS CreatedAt,
                   
                   updated_at                 AS UpdatedAt
            FROM welfare_requests
            WHERE request_id = @RequestId;";

        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<WelfareRequest>(
            sql, new { RequestId = requestId });
    }

    public async Task<int> CountByUserAsync(int userId)
    {
        const string sql = "SELECT COUNT(*) FROM welfare_requests WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(sql, new { UserId = userId });
    }

    public async Task<int> CountByUserSinceAsync(int userId, DateTime since)
    {
        const string sql = @"
            SELECT COUNT(*) FROM welfare_requests
            WHERE user_id = @UserId AND created_at >= @Since;";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(
            sql, new { UserId = userId, Since = since });
    }

    public async Task<bool> HasRecentSimilarAsync(int userId, string category, DateTime since)
    {
        const string sql = @"
            SELECT COUNT(*) FROM welfare_requests
            WHERE user_id = @UserId
              AND category = @Category
              AND status <> 'Rejected'
              AND created_at >= @Since;";

        using var connection = _factory.CreateConnection();
        var count = await connection.ExecuteScalarAsync<int>(
            sql, new { UserId = userId, Category = category, Since = since });
        return count > 0;
    }

    public async Task<int> CountNonRejectedByUserSinceAsync(int userId, DateTime since)
    {
        const string sql = @"
            SELECT COUNT(*) FROM welfare_requests
            WHERE user_id = @UserId
              AND status <> 'Rejected'
              AND created_at >= @Since;";

        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(
            sql, new { UserId = userId, Since = since });
    }

    public async Task<IEnumerable<QueueItemDto>> GetQueueForTierAsync(int tier, int approverId)
    {
        // Shared tier pool: In-Review requests at this tier, plus Deferred at Finance (3).
        // Every such request is shown (claimed or not) so the queue can mark "Already Claimed";
        // my_claim_count tells the UI whether THIS viewer has hit their per-request claim cap.
        const string sql = @"
            SELECT r.request_id        AS RequestId,
                   u.name              AS RequesterName,
                   r.category          AS Category,
                   r.amount            AS Amount,
                   r.status            AS Status,
                   r.current_tier      AS CurrentTier,
                   r.claimed_by        AS ClaimedBy,
                   p.priority_level    AS PriorityLevel,
                   r.validation_note   AS ValidationNote,
                   r.created_at        AS CreatedAt,
                   (SELECT COUNT(*) FROM claim_events ce
                     WHERE ce.request_id = r.request_id
                       AND ce.approver_id = @ApproverId
                       AND ce.action = 'claim')  AS MyClaimCount
            FROM welfare_requests r
            JOIN users u ON u.user_id = r.user_id
            LEFT JOIN priority_predictions p ON p.request_id = r.request_id
            WHERE r.current_tier = @Tier
              AND (
                    r.status = 'In Review'
                    OR (r.status = 'Deferred' AND @Tier = 3)
                  )
            ORDER BY
                CASE p.priority_level
                    WHEN 'High'   THEN 1
                    WHEN 'Medium' THEN 2
                    WHEN 'Low'    THEN 3
                    ELSE 4
                END,
                r.created_at ASC;";

        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<QueueItemDto>(
            sql, new { Tier = tier, ApproverId = approverId });
    }

    public async Task UpdateStatusAndTierAsync(int requestId, string status, int currentTier)
    {
        const string sql = @"
            UPDATE welfare_requests
            SET status = @Status,
                current_tier = @CurrentTier,
                updated_at = CURRENT_TIMESTAMP
            WHERE request_id = @RequestId;";

        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(
            sql, new { RequestId = requestId, Status = status, CurrentTier = currentTier });
    }
    public async Task<IEnumerable<QueueItemDto>> GetByUserAsync(int userId)
    {
                const string sql = @"
            SELECT r.request_id        AS RequestId,
                   u.name              AS RequesterName,
                   r.category          AS Category,
                   r.amount            AS Amount,
                   r.status            AS Status,
                   r.current_tier      AS CurrentTier,
                   p.priority_level    AS PriorityLevel,
                   r.validation_note   AS ValidationNote,
                   r.created_at        AS CreatedAt
            FROM welfare_requests r
            JOIN users u ON u.user_id = r.user_id
            LEFT JOIN priority_predictions p ON p.request_id = r.request_id
            WHERE r.user_id = @UserId
            ORDER BY r.created_at DESC;";

        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<QueueItemDto>(sql, new { UserId = userId});
    }
        public async Task SetDeferReasonAsync(int requestId, string reason)
    {
        const string sql = @"
            UPDATE welfare_requests
            SET defer_reason = @Reason, updated_at = CURRENT_TIMESTAMP
            WHERE request_id = @RequestId;";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { RequestId = requestId, Reason = reason });
    }
        // In-Review requests whose clock (updated_at) is older than the cutoff — i.e. they
    // have sat unactioned at their current tier past the response window.
    public async Task<IEnumerable<WelfareRequest>> GetOverdueInReviewAsync(DateTime cutoffUtc)
    {
        const string sql = @"
            SELECT request_id                 AS RequestId,
                   user_id                    AS UserId,
                   status                     AS Status,
                   current_tier               AS CurrentTier,
                   claimed_by                 AS ClaimedBy,
                   updated_at                 AS UpdatedAt
            FROM welfare_requests
            WHERE status = 'In Review'
              AND updated_at < @Cutoff;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<WelfareRequest>(sql, new { Cutoff = cutoffUtc });
    }

    // Returned requests older than the cutoff (clarification not answered in time).
    public async Task<IEnumerable<WelfareRequest>> GetOverdueReturnedAsync(DateTime cutoffUtc)
    {
        const string sql = @"
            SELECT request_id AS RequestId, user_id AS UserId, status AS Status,
                   current_tier AS CurrentTier, updated_at AS UpdatedAt
            FROM welfare_requests
            WHERE status = 'Returned'
              AND updated_at < @Cutoff;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<WelfareRequest>(sql, new { Cutoff = cutoffUtc });
    }

    // Deferred requests older than the cutoff (sat at Finance too long).
    public async Task<IEnumerable<WelfareRequest>> GetOverdueDeferredAsync(DateTime cutoffUtc)
    {
        const string sql = @"
            SELECT request_id AS RequestId, user_id AS UserId, status AS Status,
                   current_tier AS CurrentTier, updated_at AS UpdatedAt
            FROM welfare_requests
            WHERE status = 'Deferred'
              AND updated_at < @Cutoff;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<WelfareRequest>(sql, new { Cutoff = cutoffUtc });
    }

    // Record an escalation event (the escalations table).
    public async Task RecordEscalationAsync(int requestId, int tier)
    {
        const string sql = @"
            INSERT INTO escalations (request_id, tier)
            VALUES (@RequestId, @Tier);";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { RequestId = requestId, Tier = tier });
    }
}