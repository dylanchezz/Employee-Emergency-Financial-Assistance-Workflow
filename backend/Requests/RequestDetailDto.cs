using backend.Models;

namespace backend.Requests;

// Full detail for one request: the request, its prediction, and its approval history.
public class RequestDetailDto
{
    public int RequestId { get; set; }
    public string RequesterName { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? Description { get; set; }
    public string Status { get; set; } = string.Empty;
    public int CurrentTier { get; set; }
    public int? HasDocuments { get; set; }
    public string? ValidationNote { get; set; }
    public DateTime CreatedAt { get; set; }

    // Prediction (null if unclassified).
    public string? PriorityLevel { get; set; }
    public string? Explanation { get; set; }   // JSON string of the SHAP factors

    // Approval history (empty until any approver has acted).
    public List<ApprovalHistoryItem> Approvals { get; set; } = new();
}

public class ApprovalHistoryItem
{
    public int Tier { get; set; }
    public string ApproverName { get; set; } = string.Empty;
    public string Decision { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public DateTime DecidedAt { get; set; }
}