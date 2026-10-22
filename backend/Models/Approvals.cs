namespace backend.Models;

public class Approval
{
    public int ApprovalId { get; set; }
    public int RequestId { get; set; }
    public int ApproverId { get; set; }
    public int Tier { get; set; }
    public string Decision { get; set; } = string.Empty;  // 'Approved' | 'Rejected' | 'Returned'
    public string? Reason { get; set; }
    public DateTime DecidedAt { get; set; }
}