using backend.Data;
using backend.Models;

namespace backend.Requests;

public interface IValidationService
{
    Task<ValidationResult> ValidateAsync(WelfareRequest request);
}

public class ValidationService : IValidationService
{
    private readonly IWelfareRequestRepository _requests;

    // Rule thresholds (documented policy values).
    private const decimal SalaryMultiplierCap = 1.5m;
    private const int MinEmploymentMonths = 8;
    private const int MaxRequestsPerYear = 3;
    private const int DuplicateWindowDays = 21;

    public ValidationService(IWelfareRequestRepository requests)
    {
        _requests = requests;
    }

    public async Task<ValidationResult> ValidateAsync(WelfareRequest request)
    {
        // Hard blocks first (stop the flow, skip the model).

        // Rule 3: annual limit — at most 3 non-rejected requests per 12 months.
        var oneYearAgo = DateTime.UtcNow.AddYears(-1);
        var yearCount = await _requests.CountNonRejectedByUserSinceAsync(request.UserId, oneYearAgo);
        if (yearCount >= MaxRequestsPerYear)
        {
            return new ValidationResult(
                ValidationOutcome.Rejected,
                "Rejected",
                $"Annual limit of {MaxRequestsPerYear} assistance requests reached.");
        }

        // Rule 4: duplicate — a non-rejected same-category request within 21 days.
        var windowStart = DateTime.UtcNow.AddDays(-DuplicateWindowDays);
        var hasDuplicate = await _requests.HasRecentSimilarAsync(
            request.UserId, request.Category, windowStart);
        if (hasDuplicate)
        {
            return new ValidationResult(
                ValidationOutcome.Returned,
                "Returned",
                $"A similar request was submitted within the last {DuplicateWindowDays} days. " +
                "Please confirm this is not a duplicate.");
        }

        // --- Discretionary rules: flag for approver review, but do not block. ---

        var flags = new List<string>();

        // Rule 1: amount must not exceed 1.5x gross salary.
        if (request.Salary is > 0 && request.Amount > request.Salary * SalaryMultiplierCap)
        {
            flags.Add($"Requested amount exceeds {SalaryMultiplierCap}x gross salary — approver review required.");
        }

        // Rule 2: minimum employment duration of 8 months.
        if (request.EmploymentDurationMonths is int months && months < MinEmploymentMonths)
        {
            flags.Add($"Employment under {MinEmploymentMonths} months — approver review required.");
        }

        var note = flags.Count > 0 ? string.Join(" ", flags) : null;
        return new ValidationResult(ValidationOutcome.Validated, "Validated", note);
    }
}