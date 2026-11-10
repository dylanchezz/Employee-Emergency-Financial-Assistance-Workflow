using System.Reflection.Metadata;
using backend.Models;
using Dapper;

namespace backend.Data;

public interface IUserRepository
{
    Task<User?> GetByEmailAsync(string email);
    Task<User?> GetByIdAsync(int userId);
    Task<bool> SetTwoFactorEnabledAsync(int userId, bool enabled);
    Task<User?> GetByOAuthAsync(string provider, string subject);
    Task<bool> EmailExistsAsync(string email);
    Task<int> CreateOAuthUserAsync(string name, string email, string provider, string subject);
    Task<int> CreateAsync(User user);
    Task<string?> GetNameByIdAsync(int userId);
    Task<string?> GetRoleByIdAsync(int userId);
    Task<IEnumerable<int>> GetIdsByRoleAsync(string role);
    Task<(string Name, string Email)?> GetContactByIdAsync(int userId);
    Task<IEnumerable<User>> GetAllAsync();
    Task UpdateRoleAsync(int userId, string role);
}

public class UserRepository : IUserRepository
{
    private readonly IDbConnectionFactory _factory;
    public UserRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }
    public async Task<User?> GetByEmailAsync(string email)
    {
        const string sql = @"
            SELECT user_id          AS UserId,
                   name             AS Name,
                   email            AS Email,
                   password_hash    AS PasswordHash,
                   role             AS Role,
                   department       AS Department,
                   created_at       AS CreatedAt,
                   two_factor_enabled AS TwoFactorEnabled,
                   oauth_provider   AS OAuthProvider,
                   oauth_subject    AS OAuthSubject
            FROM users
            WHERE email = @Email;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<User>(sql, new {Email = email});
    }

    // Full user by id (A2) — the 2FA verify step only has the user id (from the pre-auth
    // token) and needs the name/role/email to mint the real app JWT.
    public async Task<User?> GetByIdAsync(int userId)
    {
        const string sql = @"
            SELECT user_id          AS UserId,
                   name             AS Name,
                   email            AS Email,
                   password_hash    AS PasswordHash,
                   role             AS Role,
                   department       AS Department,
                   created_at       AS CreatedAt,
                   two_factor_enabled AS TwoFactorEnabled,
                   oauth_provider   AS OAuthProvider,
                   oauth_subject    AS OAuthSubject
            FROM users
            WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<User>(sql, new { UserId = userId });
    }

    // A3: the account linked to an external identity (provider + stable subject id), if any.
    public async Task<User?> GetByOAuthAsync(string provider, string subject)
    {
        const string sql = @"
            SELECT user_id          AS UserId,
                   name             AS Name,
                   email            AS Email,
                   password_hash    AS PasswordHash,
                   role             AS Role,
                   department       AS Department,
                   created_at       AS CreatedAt,
                   two_factor_enabled AS TwoFactorEnabled,
                   oauth_provider   AS OAuthProvider,
                   oauth_subject    AS OAuthSubject
            FROM users
            WHERE oauth_provider = @Provider AND oauth_subject = @Subject;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<User>(sql, new { Provider = provider, Subject = subject });
    }

    // A3 collision check. Case-INsensitive on purpose: "Jane@Gmail.com" and "jane@gmail.com"
    // are the same inbox, so a Google sign-in must not create a second account beside either.
    public async Task<bool> EmailExistsAsync(string email)
    {
        const string sql = "SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(@Email));";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<bool>(sql, new { Email = email });
    }

    // A3: create a Google-only account — least-privileged Employee, no password, department
    // null until D1's "choose department" step (A25). Returns the new user id.
    public async Task<int> CreateOAuthUserAsync(string name, string email, string provider, string subject)
    {
        const string sql = @"
            INSERT INTO users (name, email, password_hash, role, department, oauth_provider, oauth_subject)
            VALUES (@Name, @Email, NULL, 'Employee', NULL, @Provider, @Subject)
            RETURNING user_id;";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(sql,
            new { Name = name, Email = email, Provider = provider, Subject = subject });
    }

    // Turn Email 2FA on/off for one user (A2). Returns false if no such user.
    public async Task<bool> SetTwoFactorEnabledAsync(int userId, bool enabled)
    {
        const string sql = "UPDATE users SET two_factor_enabled = @Enabled WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteAsync(sql, new { UserId = userId, Enabled = enabled }) > 0;
    }
    public async Task<int> CreateAsync(User user)
    {
        const string sql = @"
            INSERT INTO users (name, email, password_hash, role, department)
            VALUES(@Name, @Email, @PasswordHash, @Role, @Department)
            RETURNING user_id;";

        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(sql, user);
    }
        public async Task<string?> GetNameByIdAsync(int userId)
    {
        const string sql = "SELECT name FROM users WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<string>(sql, new { UserId = userId });
    }
    // A user's current role — used to confirm the original approver still staffs the tier
    // we want to send a resubmitted request back to.
    public async Task<string?> GetRoleByIdAsync(int userId)
    {
        const string sql = "SELECT role FROM users WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<string>(sql, new { UserId = userId });
    }
    // All user ids with a given role — used to notify every approver at a tier.
    public async Task<IEnumerable<int>> GetIdsByRoleAsync(string role)
    {
        const string sql = "SELECT user_id FROM users WHERE role = @Role;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<int>(sql, new { Role = role });
    }
        // Name + email for a user — used to name the responsible officer in an admin alert.
    public async Task<(string Name, string Email)?> GetContactByIdAsync(int userId)
    {
        const string sql = "SELECT name, email FROM users WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        var row = await connection.QuerySingleOrDefaultAsync<(string Name, string Email)>(
            sql, new { UserId = userId });
        return row.Name is null ? null : row;
    }

    // All users (no password hash) — for the admin user-management screen.
    public async Task<IEnumerable<User>> GetAllAsync()
    {
        const string sql = @"
            SELECT user_id    AS UserId,
                   name       AS Name,
                   email      AS Email,
                   role       AS Role,
                   department AS Department,
                   created_at AS CreatedAt
            FROM users
            ORDER BY role, name;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<User>(sql);
    }

    // Change a user's role (admin only). The DB CHECK constraint on role is the final
    // guard; the endpoint validates the string first so a bad value is a clean 400.
    public async Task UpdateRoleAsync(int userId, string role)
    {
        const string sql = "UPDATE users SET role = @Role WHERE user_id = @UserId;";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { UserId = userId, Role = role });
    }
}