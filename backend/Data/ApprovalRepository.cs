using backend.Models;
using Dapper;
using backend.Requests;

namespace backend.Data;

public interface IApprovalRepository
{
    Task<int> CreateAsync(Approval approval);
    Task<IEnumerable<Approval>> GetByRequestIdAsync(int requestId);
        Task<IEnumerable<ApprovalHistoryItem>> GetHistoryForRequestAsync(int requestId);
}

public class ApprovalRepository : IApprovalRepository
{
    private readonly IDbConnectionFactory _factory;

    public ApprovalRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    public async Task<int> CreateAsync(Approval approval)
    {
        const string sql = @"
            INSERT INTO approvals (request_id, approver_id, tier, decision, reason)
            VALUES (@RequestId, @ApproverId, @Tier, @Decision, @Reason)
            RETURNING approval_id;";

        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(sql, approval);
    }

    public async Task<IEnumerable<Approval>> GetByRequestIdAsync(int requestId)
    {
        const string sql = @"
            SELECT approval_id AS ApprovalId,
                   request_id  AS RequestId,
                   approver_id AS ApproverId,
                   tier        AS Tier,
                   decision    AS Decision,
                   reason      AS Reason,
                   decided_at  AS DecidedAt
            FROM approvals
            WHERE request_id = @RequestId
            ORDER BY decided_at ASC;";

        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<Approval>(sql, new { RequestId = requestId });
    }
    public async Task<IEnumerable<ApprovalHistoryItem>> GetHistoryForRequestAsync(int requestId)
    {
        const string sql = @"
            SELECT a.tier       AS Tier,
                   u.name       AS ApproverName,
                   a.decision   AS Decision,
                   a.reason     AS Reason,
                   a.decided_at AS DecidedAt
            FROM approvals a
            JOIN users u ON u.user_id = a.approver_id
            WHERE a.request_id = @RequestId
            ORDER BY a.decided_at ASC;";

        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<ApprovalHistoryItem>(sql, new { RequestId = requestId });
    }
}