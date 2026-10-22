using backend.Models;
using Dapper;

namespace backend.Data;

public interface IApprovalRepository
{
    Task<int> CreateAsync(Approval approval);
    Task<IEnumerable<Approval>> GetByRequestIdAsync(int requestId);
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
}