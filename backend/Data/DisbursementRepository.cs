using Dapper;
using backend.Models;
using backend.Requests;
using Npgsql;

namespace backend.Data;

// D2: data access for Finance payouts (table disbursements, migration 012).
public interface IDisbursementRepository
{
    // Requests fully approved by HR and not yet paid (status 'Approved'), oldest first.
    Task<IEnumerable<AwaitingDisbursementItem>> GetAwaitingAsync();

    // THE payout: atomically moves the request Approved → Disbursed AND records the payment.
    // Returns the new row, or null if the request was no longer 'Approved' at write time
    // (someone else disbursed it first) — the caller turns that into 409.
    Task<Disbursement?> TryDisburseAsync(int requestId, int disbursedBy, string? reference, string? note);

    // The payout for a request (for the detail page), or null if not disbursed.
    Task<Disbursement?> GetByRequestIdAsync(int requestId);
}

public class DisbursementRepository : IDisbursementRepository
{
    private readonly IDbConnectionFactory _factory;

    public DisbursementRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    public async Task<IEnumerable<AwaitingDisbursementItem>> GetAwaitingAsync()
    {
        // updated_at is when the request last changed — for an 'Approved' request that is HR's
        // final approval (nothing else touches an Approved request; the escalation worker only
        // handles In Review / Returned / Deferred), so it reads as "approved at".
        const string sql = @"
            SELECT r.request_id       AS RequestId,
                   r.user_id          AS UserId,
                   u.name             AS RequesterName,
                   u.department       AS Department,
                   r.category         AS Category,
                   r.amount           AS Amount,
                   p.priority_level   AS PriorityLevel,
                   r.updated_at       AS ApprovedAt
            FROM welfare_requests r
            JOIN users u ON u.user_id = r.user_id
            LEFT JOIN (
                SELECT DISTINCT ON (request_id) request_id, priority_level
                FROM priority_predictions
                ORDER BY request_id, predicted_at DESC
            ) p ON p.request_id = r.request_id
            WHERE r.status = 'Approved'
            ORDER BY r.updated_at ASC;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<AwaitingDisbursementItem>(sql);
    }

    public async Task<Disbursement?> TryDisburseAsync(int requestId, int disbursedBy, string? reference, string? note)
    {
        // One statement = one atomic step (the A24 fix-1 pattern, as in ClaimAsync):
        //  - the UPDATE's WHERE re-checks status = 'Approved' under the row lock, so if two
        //    Finance officers press Disburse together, the second UPDATE waits, re-checks, finds
        //    'Disbursed', and matches 0 rows;
        //  - the INSERT only runs for a row the UPDATE actually moved, and takes the amount from
        //    that row — the client never supplies an amount (build decision 1: fixed amount);
        //  - status change and payment record can't drift apart: both happen or neither does.
        // UNIQUE(request_id) on disbursements is the database-level backstop.
        const string sql = @"
            WITH moved AS (
                UPDATE welfare_requests
                SET status = 'Disbursed',
                    updated_at = CURRENT_TIMESTAMP
                WHERE request_id = @RequestId
                  AND status = 'Approved'
                RETURNING request_id, amount
            )
            INSERT INTO disbursements (request_id, disbursed_by, amount, reference, note)
            SELECT request_id, @DisbursedBy, amount, @Reference, @Note FROM moved
            RETURNING disbursement_id AS DisbursementId,
                      request_id      AS RequestId,
                      disbursed_by    AS DisbursedBy,
                      amount          AS Amount,
                      reference       AS Reference,
                      note            AS Note,
                      disbursed_at    AS DisbursedAt;";
        using var connection = _factory.CreateConnection();
        try
        {
            return await connection.QuerySingleOrDefaultAsync<Disbursement>(sql, new
            {
                RequestId = requestId,
                DisbursedBy = disbursedBy,
                Reference = reference,
                Note = note,
            });
        }
        catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            return null;   // the UNIQUE backstop fired — already paid
        }
    }

    public async Task<Disbursement?> GetByRequestIdAsync(int requestId)
    {
        const string sql = @"
            SELECT d.disbursement_id AS DisbursementId,
                   d.request_id      AS RequestId,
                   d.disbursed_by    AS DisbursedBy,
                   d.amount          AS Amount,
                   d.reference       AS Reference,
                   d.note            AS Note,
                   d.disbursed_at    AS DisbursedAt,
                   u.name            AS DisbursedByName
            FROM disbursements d
            JOIN users u ON u.user_id = d.disbursed_by
            WHERE d.request_id = @RequestId;";
        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<Disbursement>(sql, new { RequestId = requestId });
    }
}
