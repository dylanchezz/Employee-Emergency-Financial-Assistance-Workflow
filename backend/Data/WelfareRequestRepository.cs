using backend.Models;
using Dapper;

namespace backend.Data;

public interface IWelfareRequestRepository
{
    Task<int> CreateAsync(WelfareRequest request);
    Task<WelfareRequest?> GetByIdAsync(int requestId);
    Task<int> CountByUserAsync(int userId);
    Task<int> CountByUserSinceAsync(int userId, DateTime since);
    Task<bool> HasRecentSimilarAsync(int userId, string category, DateTime since);
    Task<int> CountNonRejectedByUserSinceAsync(int userId, DateTime since);
}

public class WelfareRequestRepository: IWelfareRequestRepository
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
                   validation_note            AS ValidationNote,
                   created_at                 AS CreatedAt,
                   updated_at                 AS UpdatedAt
            FROM welfare_requests
            WHERE request_id = @RequestId;";

        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<WelfareRequest>(
            sql, new { RequestId = requestId});
    }
    public async Task<int> CountByUserAsync(int userId)
    {
        const string sql = "SELECT COUNT(*) FROM welfare_requests WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(sql, new { UserId = userId});
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
}