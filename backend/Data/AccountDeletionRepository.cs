using System.Data;
using Dapper;
using backend.Models;
using Npgsql;

namespace backend.Data;

// C2: account deletion as SOFT-DELETE. Approval deactivates the user (users.is_active = false);
// nothing is ever hard-deleted, so the FR-11 history survives.
public enum ApproveDeletionOutcome
{
    Approved,     // user deactivated, request marked Approved
    NotPending,   // no such request, or it was already decided / cancelled
    LastAdmin,    // refused: the target is the last ACTIVE System Administrator
}

public interface IAccountDeletionRepository
{
    // A new Pending request. Null if the user already has one (partial unique index → 409).
    Task<AccountDeletionRequest?> CreateAsync(int userId, string? reason);

    // The user's most recent request (any status), for their account area.
    Task<AccountDeletionRequest?> GetLatestForUserAsync(int userId);

    // The user cancels their own request — only while it is still Pending (conditional write).
    Task<bool> CancelPendingAsync(int userId);

    // Admin queue: every Pending request with the requester's details, oldest first.
    Task<IEnumerable<AccountDeletionRequest>> GetPendingAsync();

    Task<AccountDeletionRequest?> GetByIdAsync(int deletionId);

    // Admin approves: deactivate + mark Approved, atomically, with the last-admin guard inside.
    Task<ApproveDeletionOutcome> ApproveAsync(int deletionId, int adminId);

    // Admin rejects: only a Pending request (conditional write). The account stays active.
    Task<bool> RejectAsync(int deletionId, int adminId, string? reason);
}

public class AccountDeletionRepository : IAccountDeletionRepository
{
    // Any fixed number: every approval takes this lock first, so approvals run one at a time.
    // That is what makes the last-admin COUNT safe — two admins can't both see "2 active admins"
    // and deactivate each other in parallel, leaving none.
    private const long DeactivationLockKey = 4_213_013;

    private const string SelectColumns = @"
        r.deletion_id  AS DeletionId,
        r.user_id      AS UserId,
        r.status       AS Status,
        r.reason       AS Reason,
        r.requested_at AS RequestedAt,
        r.decided_by   AS DecidedBy,
        r.decided_at   AS DecidedAt";

    private readonly IDbConnectionFactory _factory;

    public AccountDeletionRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    public async Task<AccountDeletionRequest?> CreateAsync(int userId, string? reason)
    {
        var sql = $@"
            INSERT INTO account_deletion_requests AS r (user_id, reason)
            VALUES (@UserId, @Reason)
            RETURNING {SelectColumns};";
        using var connection = _factory.CreateConnection();
        try
        {
            return await connection.QuerySingleAsync<AccountDeletionRequest>(sql, new { UserId = userId, Reason = reason });
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return null;   // uq_account_deletion_one_pending: already has a Pending request
        }
    }

    public async Task<AccountDeletionRequest?> GetLatestForUserAsync(int userId)
    {
        var sql = $@"
            SELECT {SelectColumns}
            FROM account_deletion_requests r
            WHERE r.user_id = @UserId
            ORDER BY r.requested_at DESC, r.deletion_id DESC
            LIMIT 1;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<AccountDeletionRequest>(sql, new { UserId = userId });
    }

    public async Task<bool> CancelPendingAsync(int userId)
    {
        const string sql = @"
            UPDATE account_deletion_requests
            SET status = 'Cancelled', decided_at = now()
            WHERE user_id = @UserId AND status = 'Pending';";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteAsync(sql, new { UserId = userId }) > 0;
    }

    public async Task<IEnumerable<AccountDeletionRequest>> GetPendingAsync()
    {
        var sql = $@"
            SELECT {SelectColumns},
                   u.name       AS Name,
                   u.email      AS Email,
                   u.role       AS Role,
                   u.department AS Department
            FROM account_deletion_requests r
            JOIN users u ON u.user_id = r.user_id
            WHERE r.status = 'Pending'
            ORDER BY r.requested_at ASC;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<AccountDeletionRequest>(sql);
    }

    public async Task<AccountDeletionRequest?> GetByIdAsync(int deletionId)
    {
        var sql = $@"
            SELECT {SelectColumns},
                   u.name AS Name, u.email AS Email, u.role AS Role, u.department AS Department
            FROM account_deletion_requests r
            JOIN users u ON u.user_id = r.user_id
            WHERE r.deletion_id = @DeletionId;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<AccountDeletionRequest>(sql, new { DeletionId = deletionId });
    }

    public async Task<ApproveDeletionOutcome> ApproveAsync(int deletionId, int adminId)
    {
        using var connection = _factory.CreateConnection();
        connection.Open();
        using var tx = connection.BeginTransaction();

        // 1. Serialise every approval (see DeactivationLockKey). Released automatically at
        //    commit/rollback — a transaction-scoped advisory lock.
        await connection.ExecuteAsync("SELECT pg_advisory_xact_lock(@Key);", new { Key = DeactivationLockKey }, tx);

        // 2. The request must still be Pending (row-locked, so a parallel reject/cancel waits).
        var target = await connection.QuerySingleOrDefaultAsync<(int UserId, string Role, bool IsActive)>(@"
            SELECT r.user_id AS UserId, u.role AS Role, u.is_active AS IsActive
            FROM account_deletion_requests r
            JOIN users u ON u.user_id = r.user_id
            WHERE r.deletion_id = @DeletionId AND r.status = 'Pending'
            FOR UPDATE OF r;", new { DeletionId = deletionId }, tx);
        if (target.Role is null)
        {
            tx.Rollback();
            return ApproveDeletionOutcome.NotPending;
        }

        // 3. Last-admin guard (A19 idea): never deactivate the last ACTIVE System Administrator —
        //    nobody would be left to run the system (or to reactivate anyone).
        if (target.Role == "System Administrator" && target.IsActive)
        {
            var activeAdmins = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*)::int FROM users WHERE role = 'System Administrator' AND is_active;", transaction: tx);
            if (activeAdmins <= 1)
            {
                tx.Rollback();
                return ApproveDeletionOutcome.LastAdmin;
            }
        }

        // 4. Soft-delete + record the decision — both or neither.
        await connection.ExecuteAsync(@"
            UPDATE users SET is_active = false, deactivated_at = now()
            WHERE user_id = @UserId;", new { target.UserId }, tx);
        await connection.ExecuteAsync(@"
            UPDATE account_deletion_requests
            SET status = 'Approved', decided_by = @AdminId, decided_at = now()
            WHERE deletion_id = @DeletionId;", new { DeletionId = deletionId, AdminId = adminId }, tx);

        tx.Commit();
        return ApproveDeletionOutcome.Approved;
    }

    public async Task<bool> RejectAsync(int deletionId, int adminId, string? reason)
    {
        // Conditional write: only a Pending request can be rejected. The admin's reason is kept
        // when given; otherwise the requester's original reason stays.
        const string sql = @"
            UPDATE account_deletion_requests
            SET status = 'Rejected', decided_by = @AdminId, decided_at = now(),
                reason = COALESCE(@Reason, reason)
            WHERE deletion_id = @DeletionId AND status = 'Pending';";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteAsync(sql, new { DeletionId = deletionId, AdminId = adminId, Reason = reason }) > 0;
    }
}
