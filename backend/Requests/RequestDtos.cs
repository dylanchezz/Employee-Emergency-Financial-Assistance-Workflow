namespace backend.Requests;

// (SubmitRequestDto removed in the A24 hardening pass — submission switched to multipart
// form data with the document upload (#39), so the endpoint reads form fields directly
// and this JSON DTO was no longer used anywhere.)

//An approver's decison on a request
public record DecisionDto(string Decision, string? Reason);

// D2: Finance's disburse action. Deliberately NO amount field — the amount paid is always the
// request's approved amount, taken server-side (build decision 1). Both fields are optional.
public record DisburseDto(string? Reference, string? Note);

// D2: one row of Finance's "awaiting disbursement" list (status 'Approved').
public class AwaitingDisbursementItem
{
    public int RequestId { get; set; }
    public int UserId { get; set; }              // so the UI can mark the officer's own request
    public string RequesterName { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? PriorityLevel { get; set; }
    public DateTime ApprovedAt { get; set; }
}
