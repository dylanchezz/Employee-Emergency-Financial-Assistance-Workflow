using backend.Models;
using Dapper;

namespace backend.Data;

public interface IPriorityPredictionRepository
{
    Task<int> CreateAsync(PriorityPrediction prediction);
    Task<PriorityPrediction?> GetByRequestIdAsync(int requestId);
    Task<IEnumerable<PriorityPrediction>> GetAllByRequestIdAsync(int requestId);
}

public class PriorityPredictionRepository : IPriorityPredictionRepository
{
    private readonly IDbConnectionFactory _factory;

    public PriorityPredictionRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    public async Task<int> CreateAsync(PriorityPrediction prediction)
    {
        const string sql = @"
            INSERT INTO priority_predictions (request_id, priority_level, explanation)
            VALUES (@RequestId, @PriorityLevel, CAST(@Explanation AS jsonb))
            RETURNING prediction_id;";

        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(sql, prediction);
    } 
    // The CURRENT prediction for a request. Since a request can now hold several
    // predictions (one per resubmit — migration 008 dropped the UNIQUE), return the
    // newest by predicted_at. Older rows are kept for history (GetAllByRequestIdAsync).
    public async Task<PriorityPrediction?> GetByRequestIdAsync(int requestId)
    {
        const string sql = @"
                SELECT prediction_id  AS PredictionId,
                   request_id     AS RequestId,
                   priority_level AS PriorityLevel,
                   explanation    AS Explanation,
                   predicted_at   AS PredictedAt
            FROM priority_predictions
            WHERE request_id = @RequestId
            ORDER BY predicted_at DESC
            LIMIT 1;";

        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<PriorityPrediction>(
            sql, new { RequestId = requestId });
    }

    // Every prediction for a request, newest first — so the UI can show the priority
    // history across resubmits (e.g. "was Low -> now Medium").
    public async Task<IEnumerable<PriorityPrediction>> GetAllByRequestIdAsync(int requestId)
    {
        const string sql = @"
                SELECT prediction_id  AS PredictionId,
                   request_id     AS RequestId,
                   priority_level AS PriorityLevel,
                   explanation    AS Explanation,
                   predicted_at   AS PredictedAt
            FROM priority_predictions
            WHERE request_id = @RequestId
            ORDER BY predicted_at DESC;";

        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<PriorityPrediction>(
            sql, new { RequestId = requestId });
    }
}   
