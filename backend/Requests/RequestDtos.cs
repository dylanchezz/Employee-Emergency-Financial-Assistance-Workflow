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
