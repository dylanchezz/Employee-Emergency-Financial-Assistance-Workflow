namespace backend.Requests;

//3 possible outcomes of rule based validation
public enum ValidationOutcome
{
    Validated,  
    Returned,  
    Rejected
}

public record ValidationResult(
    ValidationOutcome Outcome,
    string Status,
    string? Note
);