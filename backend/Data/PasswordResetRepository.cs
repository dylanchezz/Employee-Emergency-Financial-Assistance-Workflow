using Dapper;

namespace backend.Data;

// Phase 7 (A4) — data access for "forgot password" tokens (migration 016). Modelled on
// TwoFactorCodeRepository (A2): only a HASH of the secret is stored, and expiry is always judged
// with the database's now(), so there is one clock for "is this link still valid?".
public interface IPasswordResetRepository
{
    // Seconds since this user's newest token was issued (null = never) — for the resend cooldown.
    Task<double?> SecondsSinceLatestAsync(int userId);

    // Store a fresh token and retire every earlier unused one, so only the NEWEST link works.
    Task IssueAsync(int userId, string tokenHash, TimeSpan lifetime);

    // Consume a token and set the new password in ONE transaction. Returns the user id on success,
    // or null if the token is unknown, expired, already used, or its account can't take a password
    // (Google-only or deactivated). The conditional write makes it single-use even under a race.
    Task<int?> ConsumeAndSetPasswordAsync(string tokenHash, string newPasswordHash);
}

public class PasswordResetRepository : IPasswordResetRepository
{
    private readonly IDbConnectionFactory _factory;

    public PasswordResetRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    public async Task<double?> SecondsSinceLatestAsync(int userId)
    {
        const string sql = @"
            SELECT EXTRACT(EPOCH FROM (now() - max(created_at)))::float8
            FROM password_reset_tokens
            WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<double?>(sql, new { UserId = userId });
    }

    public async Task IssueAsync(int userId, string tokenHash, TimeSpan lifetime)
    {
        // Two statements in one batch = one implicit transaction (same as TwoFactorCodeRepository).
        // Older links are EXPIRED (kept for the record), not deleted.
        const string sql = @"
            UPDATE password_reset_tokens
            SET expires_at = now()
            WHERE user_id = @UserId AND used_at IS NULL AND expires_at > now();
            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
            VALUES (@UserId, @TokenHash, now() + (@Seconds * interval '1 second'));";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new
        {
            UserId = userId,
            TokenHash = tokenHash,
            Seconds = (int)lifetime.TotalSeconds,
        });
    }

    public async Task<int?> ConsumeAndSetPasswordAsync(string tokenHash, string newPasswordHash)
    {
        // One statement, so it is atomic on its own:
        //   1. `used` claims the token — only if unused AND unexpired (the A24 fix-1 conditional-write
        //      pattern: of two parallel resets with the same link, exactly one gets a row back);
        //   2. `pw` sets the new hash — only for an ACTIVE PASSWORD account (never turns a Google-only
        //      account into a password one), and (A1) clears any lock + failure count;
        //   3. if step 2 matched no account, step 1 is still committed — the link is burnt either way,
        //      which is the safe direction.
        const string sql = @"
            WITH used AS (
                UPDATE password_reset_tokens
                SET used_at = now()
                WHERE token_hash = @TokenHash AND used_at IS NULL AND expires_at > now()
                RETURNING user_id
            ), pw AS (
                UPDATE users u
                SET password_hash = @NewHash, failed_login_count = 0, locked_until = NULL
                FROM used
                WHERE u.user_id = used.user_id AND u.password_hash IS NOT NULL AND u.is_active
                RETURNING u.user_id
            )
            SELECT user_id FROM pw;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<int?>(sql,
            new { TokenHash = tokenHash, NewHash = newPasswordHash });
    }
}
