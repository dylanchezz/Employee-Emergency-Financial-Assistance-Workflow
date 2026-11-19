namespace backend.Requests;

// Requester history — everything an approver (or the admin) needs to see about an employee's
// past requests while deciding on a new one: the request itself, the model's priority, every
// approval decision, deferral, disbursement and the request's whole activity trail.
// Staff-only (see RequestHistoryEndpoints), so internal notes (forward notes, Finance memo)
// are included.

public class RequesterHistoryDto
{
    public RequesterInfo Requester { get; set; } = new();
    public RequesterHistorySummary Summary { get; set; } = new();
    public List<HistoricalRequestDto> Requests { get; set; } = new();   // newest first
}

public class RequesterInfo
{
    public int UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class RequesterHistorySummary
{
    public int Total { get; set; }
    public int Disbursed { get; set; }
    public int ApprovedAwaitingPayout { get; set; }
    public int Rejected { get; set; }
    public int Pending { get; set; }          // still somewhere in the workflow (incl. Returned / Deferred)
    public decimal TotalRequested { get; set; }
    public decimal TotalDisbursed { get; set; }
    public DateTime? LastRequestAt { get; set; }
}

public class HistoricalRequestDto
{
    public int RequestId { get; set; }
    public string Category { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? Description { get; set; }
    public string Status { get; set; } = string.Empty;
    public int CurrentTier { get; set; }
    public string? ValidationNote { get; set; }
    public string? DeferReason { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    // Model-input snapshot submitted with the request.
    public decimal? Salary { get; set; }
    public int? EmploymentDurationMonths { get; set; }

    // Latest model prediction (null = unclassified).
    public string? PriorityLevel { get; set; }
    public string? Explanation { get; set; }   // SHAP factors, JSON string

    // Supporting document (metadata only — the file itself is served by /api/requests/{id}/document).
    public bool HasDocument { get; set; }
    public string? DocumentName { get; set; }

    // The decision reached, in one line, plus who/when where it applies.
    public RequestOutcome Outcome { get; set; } = new();

    public List<ApprovalHistoryItem> Approvals { get; set; } = new();   // oldest first
    public DisbursementInfo? Disbursement { get; set; }
    public List<HistoryActivityItem> Activity { get; set; } = new();     // full audit trail, oldest first
}

public class RequestOutcome
{
    // "Disbursed" | "Approved" | "Rejected" | "Returned" | "Deferred" | "Pending"
    public string Kind { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string? Reason { get; set; }
    public string? DecidedBy { get; set; }
    public DateTime? DecidedAt { get; set; }
}

public class HistoryActivityItem
{
    public string Actor { get; set; } = string.Empty;   // "System" when no human actor
    public string Action { get; set; } = string.Empty;
    public DateTime LoggedAt { get; set; }
}
