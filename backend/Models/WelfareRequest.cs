namespace backend.Models;

public class WelfareRequest
{
    public int RequestId { get; set; }
    public int UserId { get; set; }
    public string Category { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? Description { get; set; }
    public string? ValidationNote { get; set; }

    //Model-input snapshot
    public decimal? Salary{ get; set; }
    public int? EmploymentDurationMonths { get; set; }
    public int? PreviousRequests { get; set; }
    public int? RequestFrequency { get; set; }
    public int? HasDocuments { get; set; }

    public string Status { get; set; } = "Submitted";
    public int CurrentTier { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

}