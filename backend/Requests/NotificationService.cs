using backend.Data;

namespace backend.Requests;

public interface INotificationService
{
    // Notify about a decision outcome on a request.
    //   employeeId  = the request's owner
    //   decision    = "Approve" | "Reject" | "Return" | "Defer"
    //   newStatus   = the resulting status ("In Review" / "Approved" / "Rejected" / "Returned" / "Deferred")
    //   nextTier    = the tier the request is now at (for "awaiting review" to the next approvers)
    //   reason      = the approver's reason (for reject/return/defer), if any
    Task OnDecisionAsync(int requestId, int employeeId, string decision, string newStatus, int nextTier, string? reason);

    // Notify the employee when validation rejects/returns their request at submission.
    Task OnSubmissionOutcomeAsync(int requestId, int employeeId, string status, string? note);
}

public class NotificationService : INotificationService
{
    private readonly INotificationRepository _notifications;
    private readonly IUserRepository _users;

    public NotificationService(INotificationRepository notifications, IUserRepository users)
    {
        _notifications = notifications;
        _users = users;
    }

    // Tier → the role whose officers staff it (for notifying "the next approver").
    private static string? RoleForTier(int tier) => tier switch
    {
        1 => "Department Supervisor",
        2 => "Welfare Officer",
        3 => "Finance Officer",
        4 => "HR Manager",
        _ => null,
    };

    public async Task OnDecisionAsync(
        int requestId, int employeeId, string decision, string newStatus, int nextTier, string? reason)
    {
        // 1. Always notify the employee about the outcome of THEIR request.
        var employeeMessage = decision switch
        {
            "Approve" when newStatus == "Approved" =>
                $"Your request #{requestId} has been fully approved.",
            "Approve" =>
                $"Your request #{requestId} was approved at this stage and moved to the next approver.",
            "Reject" =>
                $"Your request #{requestId} was rejected." + ReasonSuffix(reason),
            "Return" =>
                $"Your request #{requestId} was returned for clarification." + ReasonSuffix(reason),
            "Defer" =>
                $"Your request #{requestId} was deferred." + ReasonSuffix(reason),
            _ => $"Your request #{requestId} status changed to {newStatus}.",
        };
        await _notifications.CreateAsync(requestId, employeeId, employeeMessage);

        // 2. If the request advanced (still In Review at a new tier), notify that tier's approvers.
        if (decision == "Approve" && newStatus == "In Review")
        {
            var role = RoleForTier(nextTier);
            if (role is not null)
            {
                var approverIds = await _users.GetIdsByRoleAsync(role);
                foreach (var approverId in approverIds)
                {
                    await _notifications.CreateAsync(
                        requestId, approverId,
                        $"Request #{requestId} is awaiting your review.");
                }
            }
        }
    }

    public async Task OnSubmissionOutcomeAsync(int requestId, int employeeId, string status, string? note)
    {
        // Only notify when the request was stopped at submission (rejected/returned by the rules).
        if (status is not ("Rejected" or "Returned")) return;

        var message = status == "Rejected"
            ? $"Your request #{requestId} was rejected at submission." + ReasonSuffix(note)
            : $"Your request #{requestId} was returned at submission." + ReasonSuffix(note);
        await _notifications.CreateAsync(requestId, employeeId, message);
    }

    private static string ReasonSuffix(string? reason) =>
        string.IsNullOrWhiteSpace(reason) ? "" : $" Reason: {reason}";
}