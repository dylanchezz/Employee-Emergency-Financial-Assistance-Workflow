namespace backend.Requests;

//What the employee submits
public record SubmitRequestDto(
    string Category,
    decimal Amount,
    string? Description,
    decimal Salary,
    int EmploymentDurationMonths,
    int HasDocuments
);

//An approver's decison on a request
public record DecisionDto(string Decision, string? Reason);
