namespace backend.Requests;

// Time windows for automatic escalation, in one place so they're easy to change.
// The tier window is intentionally SHORT for the demo; the documented production
// value is 18 hours. The others match the documented policy.
public static class EscalationPolicy
{
    // How long a request may sit In-Review at a tier before it escalates.
    // Demo value: 1 minute. Production: TimeSpan.FromHours(18).
    public static readonly TimeSpan TierResponseWindow = TimeSpan.FromMinutes(1);

    // How long a Returned request may wait for the employee's clarification
    // before it is auto-rejected. Documented: 7 days.
    public static readonly TimeSpan ClarificationTimeout = TimeSpan.FromDays(7);

    // How long a Deferred request may sit at Finance before admins are alerted.
    // (A deferral is a funds issue, not the employee's fault — we alert, not auto-reject.)
    public static readonly TimeSpan DeferredTimeout = TimeSpan.FromDays(3);

    // How often the background worker checks for overdue requests.
    public static readonly TimeSpan CheckInterval = TimeSpan.FromSeconds(30);
}