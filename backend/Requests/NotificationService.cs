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
        Task OnDecisionAsync(int requestId, int employeeId, string decision, string newStatus, int nextTier, int actingTier, string? reason);

    // Notify the employee when validation rejects/returns their request at submission; or, when
    // it passed, tell the approvers at the tier it entered (D1: RoutingPolicy.InitialTierFor).
        Task OnSubmissionOutcomeAsync(int requestId, int employeeId, string status, string? note, int entryTier);

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
    // The in-system alert is always written; sendEmail=false skips the email copy (used for
    // repeat HR re-alerts so a stuck request doesn't email every admin on every pass).
    Task OnAdminAlertAsync(int requestId, string message, int? responsibleOfficerId, bool sendEmail = true);

    // Tell the officer who claimed a request but didn't action it that it was taken from them.
    Task OnSlowOfficerAsync(int requestId, int officerId, bool wentUpATier);

    // Tell all approvers at a tier that an unclaimed request escalated past their level.
    Task OnTierMissedAsync(int requestId, int tier);
}

public class NotificationService : INotificationService
{
    private readonly INotificationRepository _notifications;
    private readonly IUserRepository _users;
    private readonly IEmailService _email;

    public NotificationService(
        INotificationRepository notifications, IUserRepository users, IEmailService email)
    {
        _notifications = notifications;
        _users = users;
        _email = email;
    }

    // Look up a user's email and send them one, recording an 'Email' notification row when it
    // goes out. Best-effort — if there's no email or the send fails, the in-system notification
    // (written separately by the caller) still stands.
    private async Task EmailUserAsync(int requestId, int userId, string subject, string body)
    {
        var contact = await _users.GetContactByIdAsync(userId);
        if (contact is null || string.IsNullOrWhiteSpace(contact.Value.Email)) return;

        var sent = await _email.SendAsync(contact.Value.Email, subject, body);
        if (sent)
        {
            await _notifications.CreateEmailAsync(requestId, userId, body);
        }
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

    // D1: THE audience for every "approvers at tier N" notification about a request.
    //  - everyone with the tier's role, EXCEPT the request's owner (the self-approval guard,
    //    A24 #2, means they could never act on it — this generalises A24 #6, which skipped a
    //    supervisor-submitter at tier 1 only, to every tier);
    //  - at the department-scoped tier (1), only supervisors in the owner's department.
    // One helper, so the queue rule and the notification rule can't drift apart.
    private async Task<IEnumerable<int>> ApproverAudienceAsync(int requestId, int tier)
    {
        var role = RoleForTier(tier);
        if (role is null) return Enumerable.Empty<int>();
        return await _users.GetApproverIdsForRequestAsync(
            requestId, role, sameDepartmentAsOwner: tier == RoutingPolicy.DepartmentScopedTier);
    }

    public async Task OnDecisionAsync(
        int requestId, int employeeId, string decision, string newStatus, int nextTier, int actingTier, string? reason)
    {
        // Name the tier that acted, and (when it advanced) the tier it moved to — so the
        // employee sees exactly where their request stands, not a generic "at this stage".
        var actingRole = RoleForTier(actingTier) ?? $"tier {actingTier}";
        var nextRole = RoleForTier(nextTier) ?? $"tier {nextTier}";

        // 1. Always notify the employee about the outcome of THEIR request.
        var employeeMessage = decision switch
        {
            "Approve" when newStatus == "Approved" =>
                $"Your request #{requestId} has been fully approved by the {actingRole} — this was the final approval stage.",
            "Approve" =>
                $"Your request #{requestId} was approved by the {actingRole} and has moved to the {nextRole} for the next stage of review.",
            // No approver tier acted (tier 0 = stopped at the automatic checks) — e.g. the
            // escalation worker auto-rejecting a check-returned request whose clarification
            // window expired. Say so, instead of "rejected by the tier 0".
            "Reject" when RoleForTier(actingTier) is null =>
                $"Your request #{requestId} was rejected automatically by the system." + ReasonSuffix(reason),
            "Reject" =>
                $"Your request #{requestId} was rejected by the {actingRole}." + ReasonSuffix(reason),
            "Return" =>
                $"Your request #{requestId} was returned for clarification by the {actingRole}." + ReasonSuffix(reason),
            "Defer" =>
                $"Your request #{requestId} was deferred by the {actingRole} (funds temporarily unavailable)." + ReasonSuffix(reason),
            _ => $"Your request #{requestId} status changed to {newStatus}.",
        };
        await _notifications.CreateAsync(requestId, employeeId, employeeMessage);
        // Email the employee the same outcome (key event). Best-effort.
        await EmailUserAsync(
            requestId, employeeId,
            $"Update on your assistance request #{requestId}",
            employeeMessage);

        // 2. If the request advanced (still In Review at a new tier), notify that tier's approvers.
        if (decision == "Approve" && newStatus == "In Review")
        {
            foreach (var approverId in await ApproverAudienceAsync(requestId, nextTier))
            {
                await _notifications.CreateAsync(
                    requestId, approverId,
                    $"Request #{requestId} is awaiting your review.");
            }
        }
    }

    public async Task OnSubmissionOutcomeAsync(int requestId, int employeeId, string status, string? note, int entryTier)
    {
        // Passed validation → it has just entered the queue at entryTier — tier 1 (the
        // employee's own Department Supervisors) or, for a supervisor's own request, tier 2
        // (D1: decided once, in RoutingPolicy.InitialTierFor). Tell that tier it's waiting.
        // (A24 #6's "skip the submitter" now lives in ApproverAudienceAsync, for every tier.)
        if (status == "In Review")
        {
            foreach (var approverId in await ApproverAudienceAsync(requestId, entryTier))
            {
                await _notifications.CreateAsync(
                    requestId, approverId,
                    $"Request #{requestId} is awaiting your review.");
            }
            return;
        }

        // Otherwise only notify when the request was stopped at submission (rejected/returned by the rules).
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

        // 2b. Otherwise it's back in the shared pool — tell that tier's approvers (D1 audience).
        foreach (var approverId in await ApproverAudienceAsync(requestId, tier))
        {
            await _notifications.CreateAsync(
                requestId, approverId,
                $"Request #{requestId} was resubmitted with clarifications and is awaiting your review again.");
        }
    }

    public async Task OnEscalatedToTierAsync(int requestId, int newTier)
    {
        foreach (var approverId in await ApproverAudienceAsync(requestId, newTier))
        {
            await _notifications.CreateAsync(
                requestId, approverId,
                $"Request #{requestId} was escalated to you (not actioned in time at the previous stage) and is awaiting your review.");
        }
    }

    public async Task OnReleasedToPeersAsync(int requestId, int tier, int slowOfficerId)
    {
        // D1: at tier 1 the "peers" are the other supervisors of the employee's department.
        foreach (var id in await ApproverAudienceAsync(requestId, tier))
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

    public async Task OnAdminAlertAsync(int requestId, string message, int? responsibleOfficerId, bool sendEmail = true)
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
            // Email each admin the alert too (key event — they may be away from the app). Best-effort.
            // Skipped for repeat re-alerts (sendEmail=false) — the in-system row above still stands.
            if (sendEmail)
            {
                await EmailUserAsync(
                    requestId, adminId,
                    $"Action needed: request #{requestId}",
                    fullMessage);
            }
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
        foreach (var id in await ApproverAudienceAsync(requestId, tier))
        {
            await _notifications.CreateAsync(
                requestId, id,
                $"Request #{requestId} escalated past your level — it was not claimed and actioned in time.");
        }
    }

    private static string ReasonSuffix(string? reason) =>
        string.IsNullOrWhiteSpace(reason) ? "" : $" Reason: {reason}";
}