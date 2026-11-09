namespace backend.Requests;

// (SubmitRequestDto removed in the A24 hardening pass — submission switched to multipart
// form data with the document upload (#39), so the endpoint reads form fields directly
// and this JSON DTO was no longer used anywhere.)

//An approver's decison on a request
public record DecisionDto(string Decision, string? Reason);
