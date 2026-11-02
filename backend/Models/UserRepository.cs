using System.Reflection.Metadata;
using backend.Models;
using Dapper;

namespace backend.Data;

public interface IUserRepository
{
    Task<User?> GetByEmailAsync(string email);
    Task<int> CreateAsync(User user);
    Task<string?> GetNameByIdAsync(int userId);
    Task<IEnumerable<int>> GetIdsByRoleAsync(string role);
    Task<(string Name, string Email)?> GetContactByIdAsync(int userId);
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
}