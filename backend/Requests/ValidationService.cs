using backend.Data;
using backend.Models;

namespace backend.Requests;

public interface IValidationService
{
    Task<ValidationResult> ValidateAsync(WelfareRequest request, int? excludeRequestId = null);

    // Phase 5 (E1): how many of the user's requests count toward the annual limit right now —
    // THE count rule 3 uses. The "request stats" endpoint calls this same method, so the
    // allowance an employee is shown can never drift from the rule that would reject them.
    Task<int> CountTowardAnnualLimitAsync(int userId, int? excludeRequestId = null);
}

public class ValidationService : IValidationService
{
    private readonly IWelfareRequestRepository _requests;

    // Rule thresholds (documented policy values). Public so the admin "validation rules"
    // screen can read the SAME constants the validation logic uses — one source of truth,
    // so the displayed values can never drift from what actually runs.
    public const decimal SalaryMultiplierCap = 1.5m;
    public const int MinEmploymentMonths = 8;
    public const int MaxRequestsPerYear = 3;
    public const int DuplicateWindowDays = 21;

    public ValidationService(IWelfareRequestRepository requests)
    {
        _requests = requests;
    }

    // Phase 5 (E1): the start of the rolling 12-month window rule 3 looks back over — one definition,
    // shared by validation and the request-stats endpoint.
    public static DateTime AnnualWindowStart() => DateTime.UtcNow.AddYears(-1);

    public Task<int> CountTowardAnnualLimitAsync(int userId, int? excludeRequestId = null) =>
        _requests.CountNonRejectedByUserSinceAsync(userId, AnnualWindowStart(), excludeRequestId);

    public async Task<ValidationResult> ValidateAsync(WelfareRequest request, int? excludeRequestId = null)
    {
        // Hard blocks first (stop the flow, skip the model).

        // Rule 3: annual limit — at most 3 non-rejected requests per 12 months.
        // (Phase 5: the count now goes through CountTowardAnnualLimitAsync — same query, same window —
        // so the employee-facing allowance in E1 is computed by exactly this code.)
        var yearCount = await CountTowardAnnualLimitAsync(request.UserId, excludeRequestId);
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
            request.UserId, request.Category, windowStart, excludeRequestId);
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