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
    public string? DeferReason { get; set; }

    // Prediction (null if unclassified).
    public string? PriorityLevel { get; set; }
    public string? Explanation { get; set; }   // JSON string of the SHAP factors

    // Approval history (empty until any approver has acted).
    public List<ApprovalHistoryItem> Approvals { get; set; } = new();
    public int? ClaimedBy { get; set; }

    // Prediction history, newest first — more than one row once the request has been
    // resubmitted (so the UI can show "was Low -> now Medium"). PriorityLevel/Explanation
    // above are the current (latest) prediction; this is the full trail.
    public List<PredictionHistoryItem> PredictionHistory { get; set; } = new();

    // D2: the Finance payout, once the request is Disbursed (null before that).
    public DisbursementInfo? Disbursement { get; set; }
}

// D2: what the detail page shows about a payout. Note is the internal Finance memo —
// filled only for approver/admin viewers, never sent to the employee.
public class DisbursementInfo
{
    public decimal Amount { get; set; }
    public string? Reference { get; set; }
    public string? Note { get; set; }
    public string DisbursedByName { get; set; } = string.Empty;
    public DateTime DisbursedAt { get; set; }
}

public class ApprovalHistoryItem
{
    public int Tier { get; set; }
    public string ApproverName { get; set; } = string.Empty;
    public string Decision { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public DateTime DecidedAt { get; set; }
}

public class PredictionHistoryItem
{
    public string PriorityLevel { get; set; } = string.Empty;
    public DateTime PredictedAt { get; set; }
}