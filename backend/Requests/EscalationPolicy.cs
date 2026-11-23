namespace backend.Requests;

// Time windows for automatic escalation, in one place so they're easy to change.
// All values match the documented policy.
public static class EscalationPolicy
{
    // How long a request may sit In-Review at a tier before it escalates.
    // Documented policy: 18 hours. (For a quick escalation demo, temporarily use
    // TimeSpan.FromMinutes(1) locally.)
    public static readonly TimeSpan TierResponseWindow = TimeSpan.FromHours(18);

    // How long a Returned request may wait for the employee's clarification
    // before it is auto-rejected. Documented: 7 days.
    public static readonly TimeSpan ClarificationTimeout = TimeSpan.FromDays(7);

    // How long a Deferred request may sit at Finance before admins are alerted.
    // (A deferral is a funds issue, not the employee's fault — we alert, not auto-reject.)
    public static readonly TimeSpan DeferredTimeout = TimeSpan.FromDays(3);

    // How often the background worker checks for overdue requests.
    public static readonly TimeSpan CheckInterval = TimeSpan.FromSeconds(30);
}