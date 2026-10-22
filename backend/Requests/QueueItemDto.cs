namespace backend.Requests;

public class QueueItemDto
{
    public int RequestId { get; set; }
    public string RequesterName { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Status { get; set; } = string.Empty;
    public int CurrentTier { get; set; }
    public string? PriorityLevel { get; set; }   // null if unclassified
    public string? ValidationNote { get; set; }
    public DateTime CreatedAt { get; set; }
}