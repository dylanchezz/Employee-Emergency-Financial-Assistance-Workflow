using Dapper;
using backend.Requests;

namespace backend.Data;

// Requester history: one employee's requests with everything attached — prediction, document
// metadata, disbursement, approvals and the audit trail. Five set-based queries (not one per
// request), stitched together in RequestHistoryEndpoints. Read-only.
public interface IRequestHistoryRepository
{
    Task<RequesterInfo?> GetRequesterAsync(int userId);
    Task<IEnumerable<HistoryRequestRow>> GetRequestsAsync(int userId);
    Task<IEnumerable<HistoryApprovalRow>> GetApprovalsAsync(int userId);
    Task<IEnumerable<HistoryDisbursementRow>> GetDisbursementsAsync(int userId);
    Task<IEnumerable<HistoryActivityRow>> GetActivityAsync(int userId);
}

// Flat rows as they come back from SQL (assembled into the DTOs by the endpoint).
public class HistoryRequestRow
{
    public int RequestId { get; set; }
    public string Category { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? Description { get; set; }
    public string Status { get; set; } = string.Empty;
    public int CurrentTier { get; set; }
    public string? ValidationNote { get; set; }
    public string? DeferReason { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public decimal? Salary { get; set; }
    public int? EmploymentDurationMonths { get; set; }
    public string? PriorityLevel { get; set; }
    public string? Explanation { get; set; }
    public string? DocumentName { get; set; }
    public bool HasDocument { get; set; }
}

public class HistoryApprovalRow
{
    public int RequestId { get; set; }
    public int Tier { get; set; }
    public string ApproverName { get; set; } = string.Empty;
    public string Decision { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public DateTime DecidedAt { get; set; }
}

public class HistoryDisbursementRow
{
    public int RequestId { get; set; }
    public decimal Amount { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
    public string? DisbursedByName { get; set; }
    public DateTime DisbursedAt { get; set; }
}

public class HistoryActivityRow
{
    public int RequestId { get; set; }
    public string? ActorName { get; set; }
    public string Action { get; set; } = string.Empty;
    public DateTime LoggedAt { get; set; }
}

public class RequestHistoryRepository : IRequestHistoryRepository
{
    private readonly IDbConnectionFactory _factory;

    public RequestHistoryRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    public async Task<RequesterInfo?> GetRequesterAsync(int userId)
    {
        const string sql = @"
            SELECT user_id    AS UserId,
                   name       AS Name,
                   email      AS Email,
                   role       AS Role,
                   department AS Department,
                   is_active  AS IsActive,
                   created_at AS CreatedAt
            FROM users
            WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<RequesterInfo>(sql, new { UserId = userId });
    }

    public async Task<IEnumerable<HistoryRequestRow>> GetRequestsAsync(int userId)
    {
        // Latest prediction per request (a resubmit adds a new one); latest document per request.
        const string sql = @"
            SELECT r.request_id                 AS RequestId,
                   r.category                   AS Category,
                   r.amount                     AS Amount,
                   r.description                AS Description,
                   r.status                     AS Status,
                   r.current_tier               AS CurrentTier,
                   r.validation_note            AS ValidationNote,
                   r.defer_reason               AS DeferReason,
                   r.created_at                 AS CreatedAt,
                   r.updated_at                 AS UpdatedAt,
                   r.salary                     AS Salary,
                   r.employment_duration_months AS EmploymentDurationMonths,
                   p.priority_level             AS PriorityLevel,
                   p.explanation::text          AS Explanation,
                   d.file_name                  AS DocumentName,
                   (d.request_id IS NOT NULL)   AS HasDocument
            FROM welfare_requests r
            LEFT JOIN LATERAL (
                SELECT priority_level, explanation
                FROM priority_predictions
                WHERE request_id = r.request_id
                ORDER BY predicted_at DESC, prediction_id DESC
                LIMIT 1
            ) p ON TRUE
            LEFT JOIN LATERAL (
                SELECT request_id, file_name
                FROM documents
                WHERE request_id = r.request_id
                  AND file_bytes IS NOT NULL
                ORDER BY uploaded_at DESC, document_id DESC
                LIMIT 1
            ) d ON TRUE
            WHERE r.user_id = @UserId
            ORDER BY r.created_at DESC, r.request_id DESC;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<HistoryRequestRow>(sql, new { UserId = userId });
    }

    public async Task<IEnumerable<HistoryApprovalRow>> GetApprovalsAsync(int userId)
    {
        const string sql = @"
            SELECT a.request_id              AS RequestId,
                   a.tier                    AS Tier,
                   COALESCE(u.name, 'Unknown') AS ApproverName,
                   a.decision                AS Decision,
                   a.reason                  AS Reason,
                   a.decided_at              AS DecidedAt
            FROM approvals a
            JOIN welfare_requests r ON r.request_id = a.request_id
            LEFT JOIN users u ON u.user_id = a.approver_id
            WHERE r.user_id = @UserId
            ORDER BY a.decided_at ASC, a.approval_id ASC;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<HistoryApprovalRow>(sql, new { UserId = userId });
    }

    public async Task<IEnumerable<HistoryDisbursementRow>> GetDisbursementsAsync(int userId)
    {
        const string sql = @"
            SELECT d.request_id   AS RequestId,
                   d.amount       AS Amount,
                   d.reference    AS Reference,
                   d.note         AS Note,
                   u.name         AS DisbursedByName,
                   d.disbursed_at AS DisbursedAt
            FROM disbursements d
            JOIN welfare_requests r ON r.request_id = d.request_id
            LEFT JOIN users u ON u.user_id = d.disbursed_by
            WHERE r.user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<HistoryDisbursementRow>(sql, new { UserId = userId });
    }

    public async Task<IEnumerable<HistoryActivityRow>> GetActivityAsync(int userId)
    {
        const string sql = @"
            SELECT l.request_id AS RequestId,
                   u.name       AS ActorName,
                   l.action     AS Action,
                   l.logged_at  AS LoggedAt
            FROM audit_logs l
            JOIN welfare_requests r ON r.request_id = l.request_id
            LEFT JOIN users u ON u.user_id = l.actor_id
            WHERE r.user_id = @UserId
            ORDER BY l.logged_at ASC, l.log_id ASC;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<HistoryActivityRow>(sql, new { UserId = userId });
    }
}
