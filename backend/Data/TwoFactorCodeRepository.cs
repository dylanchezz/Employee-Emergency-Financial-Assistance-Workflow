using backend.Models;
using Dapper;

namespace backend.Data;

// Data access for Email 2FA codes (A2). Expiry is always set and judged with the database's
// now(), never DateTime.UtcNow, so there is a single clock for "is this code still valid?".
public interface ITwoFactorCodeRepository
{
    // Login: wipe any earlier codes for this user and store a fresh one. Starts a new
    // "login attempt" — the resend counter is the number of rows for the user.
    Task IssueFreshAsync(int userId, string codeHash, TimeSpan lifetime);

    // Resend: expire whatever code is still live and store a new one (old code stops working).
    Task ReplaceActiveAsync(int userId, string codeHash, TimeSpan lifetime);

    // The newest code for the user (expired or not), or null if there is none.
    Task<TwoFactorCode?> GetLatestAsync(int userId);

    // Atomically count one guess against a code. Returns the new attempt count, or null if the
    // code is gone or already at the limit (so two parallel guesses can't both slip through).
    Task<int?> TryRecordAttemptAsync(int codeId, int maxAttempts);

    // Consume a code after a correct guess. True only for the caller that actually deleted it,
    // so the same code can never mint two tokens. Also clears the user's other codes.
    Task<bool> ConsumeAsync(int userId, int codeId);

    // Lockout / failed email send: remove every code for the user.
    Task DeleteAllForUserAsync(int userId);

    // For the resend rules: how many codes exist in this login attempt, and how many seconds
    // since the newest was issued.
    Task<(int Count, double SecondsSinceLatest)> GetIssueStatsAsync(int userId);
}

public class TwoFactorCodeRepository : ITwoFactorCodeRepository
{
    private readonly IDbConnectionFactory _factory;

    public TwoFactorCodeRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    public async Task IssueFreshAsync(int userId, string codeHash, TimeSpan lifetime)
    {
        // Two statements sent as one batch run in one implicit transaction (same as ClaimAsync).
        const string sql = @"
            DELETE FROM two_factor_codes WHERE user_id = @UserId;
            INSERT INTO two_factor_codes (user_id, code_hash, expires_at)
            VALUES (@UserId, @CodeHash, now() + (@Seconds * interval '1 second'));";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new
        {
            UserId = userId,
            CodeHash = codeHash,
            Seconds = (int)lifetime.TotalSeconds,
        });
    }

    public async Task ReplaceActiveAsync(int userId, string codeHash, TimeSpan lifetime)
    {
        // Old rows are EXPIRED rather than deleted: they still count towards the resend cap.
        const string sql = @"
            UPDATE two_factor_codes
            SET expires_at = now()
            WHERE user_id = @UserId AND expires_at > now();
            INSERT INTO two_factor_codes (user_id, code_hash, expires_at)
            VALUES (@UserId, @CodeHash, now() + (@Seconds * interval '1 second'));";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new
        {
            UserId = userId,
            CodeHash = codeHash,
            Seconds = (int)lifetime.TotalSeconds,
        });
    }

    public async Task<TwoFactorCode?> GetLatestAsync(int userId)
    {
        const string sql = @"
            SELECT code_id                AS CodeId,
                   user_id                AS UserId,
                   code_hash              AS CodeHash,
                   expires_at             AS ExpiresAt,
                   attempts               AS Attempts,
                   created_at             AS CreatedAt,
                   (expires_at <= now())  AS IsExpired
            FROM two_factor_codes
            WHERE user_id = @UserId
            ORDER BY created_at DESC, code_id DESC
            LIMIT 1;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<TwoFactorCode>(sql, new { UserId = userId });
    }

    public async Task<int?> TryRecordAttemptAsync(int codeId, int maxAttempts)
    {
        // Conditional write (the A24 fix-1 lesson): the WHERE re-checks the limit under the
        // row lock, so the counter can never pass maxAttempts even with parallel requests.
        const string sql = @"
            UPDATE two_factor_codes
            SET attempts = attempts + 1
            WHERE code_id = @CodeId AND attempts < @Max
            RETURNING attempts;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<int?>(sql, new { CodeId = codeId, Max = maxAttempts });
    }

    public async Task<bool> ConsumeAsync(int userId, int codeId)
    {
        using var connection = _factory.CreateConnection();
        var deleted = await connection.ExecuteAsync(
            "DELETE FROM two_factor_codes WHERE code_id = @CodeId;", new { CodeId = codeId });
        if (deleted == 0)
        {
            return false;   // someone else consumed (or a lockout removed) it first
        }
        await connection.ExecuteAsync(
            "DELETE FROM two_factor_codes WHERE user_id = @UserId;", new { UserId = userId });
        return true;
    }

    public async Task DeleteAllForUserAsync(int userId)
    {
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(
            "DELETE FROM two_factor_codes WHERE user_id = @UserId;", new { UserId = userId });
    }

    public async Task<(int Count, double SecondsSinceLatest)> GetIssueStatsAsync(int userId)
    {
        const string sql = @"
            SELECT count(*)::int AS Count,
                   COALESCE(EXTRACT(EPOCH FROM (now() - max(created_at))), 0)::float8 AS SecondsSinceLatest
            FROM two_factor_codes
            WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleAsync<(int Count, double SecondsSinceLatest)>(
            sql, new { UserId = userId });
    }
}
