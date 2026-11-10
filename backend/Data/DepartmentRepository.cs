using Dapper;
using backend.Models;
using Npgsql;

namespace backend.Data;

// D1: data access for the canonical departments list (table departments, migration 011).
public interface IDepartmentRepository
{
    // All departments with how many users each has (admin view).
    Task<IEnumerable<Department>> GetAllAsync();

    // Exact-name existence check — the same comparison the users.department FK makes.
    Task<bool> ExistsAsync(string name);

    // Create a department. Returns the new row, or null if the name is already taken
    // (case-insensitively — "finance" next to "Finance" would split one department in two).
    Task<Department?> CreateAsync(string name);
}

public class DepartmentRepository : IDepartmentRepository
{
    private readonly IDbConnectionFactory _factory;

    public DepartmentRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    public async Task<IEnumerable<Department>> GetAllAsync()
    {
        const string sql = @"
            SELECT d.department_id AS DepartmentId,
                   d.name          AS Name,
                   d.created_at    AS CreatedAt,
                   (SELECT COUNT(*) FROM users u WHERE u.department = d.name)::int AS UserCount
            FROM departments d
            ORDER BY d.name;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<Department>(sql);
    }

    public async Task<bool> ExistsAsync(string name)
    {
        const string sql = "SELECT EXISTS (SELECT 1 FROM departments WHERE name = @Name);";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<bool>(sql, new { Name = name });
    }

    public async Task<Department?> CreateAsync(string name)
    {
        // Case-insensitive duplicate guard first (the UNIQUE constraint itself is case-sensitive).
        const string existsSql = "SELECT EXISTS (SELECT 1 FROM departments WHERE lower(name) = lower(@Name));";
        const string insertSql = @"
            INSERT INTO departments (name) VALUES (@Name)
            RETURNING department_id AS DepartmentId, name AS Name, created_at AS CreatedAt, 0 AS UserCount;";

        using var connection = _factory.CreateConnection();
        if (await connection.ExecuteScalarAsync<bool>(existsSql, new { Name = name }))
        {
            return null;
        }
        try
        {
            return await connection.QuerySingleAsync<Department>(insertSql, new { Name = name });
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return null;   // lost a race with an identical create
        }
    }
}
