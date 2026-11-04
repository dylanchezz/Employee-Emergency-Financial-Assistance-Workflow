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

    // An employee edited and resubmitted a Returned request. It passed validation and is
    // back In Review at the tier that returned it. Notify the employee it went through,
    // and notify that tier's approvers that a clarified request is waiting.
    Task OnResubmittedAsync(int requestId, int employeeId, int tier, int? assignedApproverId = null);

    // Alert all System Administrators about a request needing attention (HR overdue,
    // Notify the new tier's approvers that a request was escalated UP to them.
    Task OnEscalatedToTierAsync(int requestId, int newTier);

    // Notify same-tier peers that a request was released to them (a colleague didn't action it).
    Task OnReleasedToPeersAsync(int requestId, int tier, int slowOfficerId);

    // Notify the employee that their request was escalated because it wasn't actioned in time.
    Task OnEscalatedNotifyEmployeeAsync(int requestId, int employeeId, bool wentUpATier);

    // Alert all System Administrators; optionally name the responsible officer for follow-up.
    Task OnAdminAlertAsync(int requestId, string message, int? responsibleOfficerId);

    // Tell the officer who claimed a request but didn't action it that it was taken from them.
    Task OnSlowOfficerAsync(int requestId, int officerId, bool wentUpATier);

    // Tell all approvers at a tier that an unclaimed request escalated past their level.
    Task OnTierMissedAsync(int requestId, int tier);
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

    public async Task OnResubmittedAsync(int requestId, int employeeId, int tier, int? assignedApproverId = null)
    {
        // 1. Tell the employee their clarified request is back in review.
        await _notifications.CreateAsync(
            requestId, employeeId,
            $"Your request #{requestId} was resubmitted with your clarifications and is back under review.");

        // 2a. If it was pre-assigned back to the officer who returned it, tell just them.
        if (assignedApproverId is not null)
        {
            await _notifications.CreateAsync(
                requestId, assignedApproverId.Value,
                $"Request #{requestId}, which you returned for clarification, has been resubmitted and is assigned to you to review.");
            return;
        }

        // 2b. Otherwise it's back in the shared pool — tell every approver at that tier.
        var role = RoleForTier(tier);
        if (role is null) return;
        var approverIds = await _users.GetIdsByRoleAsync(role);
        foreach (var approverId in approverIds)
        {
            await _notifications.CreateAsync(
                requestId, approverId,
                $"Request #{requestId} was resubmitted with clarifications and is awaiting your review again.");
        }
    }

    public async Task OnEscalatedToTierAsync(int requestId, int newTier)
    {
        var role = RoleForTier(newTier);
        if (role is null) return;
        var approverIds = await _users.GetIdsByRoleAsync(role);
        foreach (var approverId in approverIds)
        {
            await _notifications.CreateAsync(
                requestId, approverId,
                $"Request #{requestId} was escalated to you (not actioned in time at the previous stage) and is awaiting your review.");
        }
    }

    public async Task OnReleasedToPeersAsync(int requestId, int tier, int slowOfficerId)
    {
        var role = RoleForTier(tier);
        if (role is null) return;
        var ids = await _users.GetIdsByRoleAsync(role);
        foreach (var id in ids)
        {
            if (id == slowOfficerId) continue; // don't ping the officer it was taken from
            await _notifications.CreateAsync(
                requestId, id,
                $"Request #{requestId} was released back to the queue (a colleague didn't action it in time) and is available to claim.");
        }
    }

    public async Task OnEscalatedNotifyEmployeeAsync(int requestId, int employeeId, bool wentUpATier)
    {
        var message = wentUpATier
            ? $"Your request #{requestId} was escalated to a higher approval level because it wasn't actioned in time."
            : $"Your request #{requestId} was reassigned because the assigned officer didn't action it in time. It remains at the same stage.";
        await _notifications.CreateAsync(requestId, employeeId, message);
    }

    public async Task OnAdminAlertAsync(int requestId, string message, int? responsibleOfficerId)
    {
        // If a specific officer is responsible, append their name + email for follow-up.
        var fullMessage = message;
        if (responsibleOfficerId is not null)
        {
            var contact = await _users.GetContactByIdAsync(responsibleOfficerId.Value);
            if (contact is not null)
            {
                fullMessage += $" Responsible officer: {contact.Value.Name} ({contact.Value.Email}).";
            }
        }
        else
        {
            fullMessage += " The request was unclaimed in the queue.";
        }

        var adminIds = await _users.GetIdsByRoleAsync("System Administrator");
        foreach (var adminId in adminIds)
        {
            await _notifications.CreateAsync(requestId, adminId, fullMessage);
        }
    }
        public async Task OnSlowOfficerAsync(int requestId, int officerId, bool wentUpATier)
    {
        var message = wentUpATier
            ? $"Request #{requestId} was escalated to a higher level because you did not action it in time."
            : $"Request #{requestId} was reassigned to your team because you did not action it in time.";
        await _notifications.CreateAsync(requestId, officerId, message);
    }

    public async Task OnTierMissedAsync(int requestId, int tier)
    {
        var role = RoleForTier(tier);
        if (role is null) return;
        var ids = await _users.GetIdsByRoleAsync(role);
        foreach (var id in ids)
        {
            await _notifications.CreateAsync(
                requestId, id,
                $"Request #{requestId} escalated past your level — it was not claimed and actioned in time.");
        }
    }

    private static string ReasonSuffix(string? reason) =>
        string.IsNullOrWhiteSpace(reason) ? "" : $" Reason: {reason}";
}