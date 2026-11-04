using System.Reflection.Metadata;
using backend.Models;
using Dapper;

namespace backend.Data;

public interface IUserRepository
{
    Task<User?> GetByEmailAsync(string email);
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
                   created_at       AS CreatedAt
            FROM users
            WHERE email = @Email;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<User>(sql, new {Email = email});
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