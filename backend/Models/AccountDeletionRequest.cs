namespace backend.Models;

// C2: one account-deletion request and its decision (table account_deletion_requests, migration 013).
public class AccountDeletionRequest
{
    public int DeletionId { get; set; }
    public int UserId { get; set; }
    public string Status { get; set; } = "Pending";   // Pending | Approved | Rejected | Cancelled
    public string? Reason { get; set; }
    public DateTime RequestedAt { get; set; }
    public int? DecidedBy { get; set; }
    public DateTime? DecidedAt { get; set; }

    // Joined for the admin queue.
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Role { get; set; }
    public string? Department { get; set; }
}
