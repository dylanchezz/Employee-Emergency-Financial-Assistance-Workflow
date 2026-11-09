using backend.Data;

namespace backend.Requests;

// A background service that runs for the app's lifetime. Every CheckInterval it scans
// for requests that have sat unactioned past their window and escalates them —
// automatically, with no user action. This is FR-09 / NFR-05.
public class EscalationWorker : BackgroundService
{
    // The audit text written when a request is flagged to admins for sitting at HR too long.
    // One constant so the "has this already been alerted?" check matches exactly what is logged.
    private const string HrAlertAuditAction =
        "Escalation: awaiting HR beyond the response window — flagged to administrators.";

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EscalationWorker> _logger;

    public EscalationWorker(IServiceScopeFactory scopeFactory, ILogger<EscalationWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("EscalationWorker started.");
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync();
            }
            catch (Exception ex)
            {
                // A failed pass must not kill the worker — log and try again next interval.
                _logger.LogError(ex, "Escalation pass failed.");
            }

            await Task.Delay(EscalationPolicy.CheckInterval, stoppingToken);
        }
    }

    // One escalation pass. The worker is a SINGLETON, but the repositories are SCOPED,
    // so we create a fresh DI scope per pass and resolve the scoped services from it.
    private async Task RunOnceAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var requests = scope.ServiceProvider.GetRequiredService<IWelfareRequestRepository>();
        var claims = scope.ServiceProvider.GetRequiredService<IClaimRepository>();
        var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
        var audit = scope.ServiceProvider.GetRequiredService<IAuditRepository>();

        var now = DateTime.UtcNow;

        // 1. In-Review requests past the tier response window.
        var tierCutoff = now - EscalationPolicy.TierResponseWindow;
        foreach (var r in await requests.GetOverdueInReviewAsync(tierCutoff))
        {
            // Decide horizontal vs. vertical:
            //  - CLAIMED + overdue, and NOT already force-released once → HORIZONTAL:
            //    take it off the slow officer, return it to the tier's peers.
            //  - otherwise (unclaimed, OR already force-released once and still late) → VERTICAL.
            var alreadyReleasedOnce = await claims.CountEscalateReleasesAsync(r.RequestId) > 0;
            var doHorizontal = r.ClaimedBy is not null && !alreadyReleasedOnce;

            if (doHorizontal && r.CurrentTier is >= 1 and <= 4)
            {
                // HORIZONTAL: force-release from the slow officer; notify same-tier peers + employee.
                var slowOfficerId = r.ClaimedBy!.Value;
                await claims.EscalateReleaseAsync(r.RequestId, slowOfficerId);
                await requests.RecordEscalationAsync(r.RequestId, r.CurrentTier);
                // Bump the clock so the peers get the window afresh.
                await requests.UpdateStatusAndTierAsync(r.RequestId, "In Review", r.CurrentTier);
                await notifications.OnReleasedToPeersAsync(r.RequestId, r.CurrentTier, slowOfficerId);
                await notifications.OnSlowOfficerAsync(r.RequestId, slowOfficerId, wentUpATier: false);  // NEW
                await notifications.OnEscalatedNotifyEmployeeAsync(r.RequestId, r.UserId, wentUpATier: false);
                _logger.LogInformation(
                    "Request {Id} horizontally released from officer {Officer} at tier {Tier}.",
                    r.RequestId, slowOfficerId, r.CurrentTier);
                await audit.LogAsync(r.RequestId, null,
                    $"Escalation: released from the assigned officer to tier {r.CurrentTier} peers (not actioned in time).");
            }
            else if (r.CurrentTier >= 4)
            {
                // VERTICAL at HR: no tier above — alert admins (name the slow officer if any).
                // The in-app alert repeats every window (deliberately persistent), but admins are
                // EMAILED only on the first one — otherwise a stuck request emails every admin on
                // every pass (with the 1-min demo window that would exhaust Brevo's 300/day cap).
                // "First" = this request has never had the HR-alert audit entry written before.
                // (We can't use the escalations table for this: a horizontal release at tier 4
                // also records a tier-4 escalation, which would wrongly suppress the first email.)
                var firstHrAlert = !await audit.HasActionAsync(r.RequestId, HrAlertAuditAction);
                await requests.RecordEscalationAsync(r.RequestId, r.CurrentTier);
                await requests.UpdateStatusAndTierAsync(r.RequestId, "In Review", r.CurrentTier);
                await notifications.OnAdminAlertAsync(
                    r.RequestId,
                    $"Request #{r.RequestId} has been awaiting HR review beyond the response window.",
                    responsibleOfficerId: r.ClaimedBy,
                    sendEmail: firstHrAlert);
                await notifications.OnEscalatedNotifyEmployeeAsync(r.RequestId, r.UserId, wentUpATier: false);
                _logger.LogInformation("Request {Id} escalated at HR tier → admin alerted.", r.RequestId);
                await audit.LogAsync(r.RequestId, null, HrAlertAuditAction);
            }
            else
            {
                // VERTICAL (tiers 1–3): advance one tier. Notify the departing tier of the miss
                // (if it was unclaimed) or the slow officer (if someone held it), the new tier, and the employee.
                var leftTier = r.CurrentTier;
                if (r.ClaimedBy is not null)
                {
                    await claims.EscalateReleaseAsync(r.RequestId, r.ClaimedBy.Value);
                    await notifications.OnSlowOfficerAsync(r.RequestId, r.ClaimedBy.Value, wentUpATier: true);
                }
                else
                {
                    // Unclaimed: the whole departing tier missed it.
                    await notifications.OnTierMissedAsync(r.RequestId, leftTier);
                }
                var newTier = leftTier + 1;
                await requests.RecordEscalationAsync(r.RequestId, leftTier);
                await requests.UpdateStatusAndTierAsync(r.RequestId, "In Review", newTier);
                await notifications.OnEscalatedToTierAsync(r.RequestId, newTier);
                await notifications.OnEscalatedNotifyEmployeeAsync(r.RequestId, r.UserId, wentUpATier: true);
                _logger.LogInformation(
                    "Request {Id} escalated UP from tier {From} to {To}.", r.RequestId, leftTier, newTier);
                await audit.LogAsync(r.RequestId, null,
                    $"Escalation: advanced from tier {leftTier} to tier {newTier} (not actioned in time).");
            }
        }

        // 2. Returned requests past the clarification timeout → auto-reject + notify.
        var returnedCutoff = now - EscalationPolicy.ClarificationTimeout;
        foreach (var r in await requests.GetOverdueReturnedAsync(returnedCutoff))
        {
            await requests.UpdateStatusAndTierAsync(r.RequestId, "Rejected", r.CurrentTier);
            // actingTier: 0 — no approver made this decision; the clarification timeout did.
            // Tier 0 has no role, so the message reads "rejected automatically by the system"
            // instead of naming the tier that returned it (which would falsely say e.g. "rejected
            // by the Welfare Officer"). Applies to system-returned and approver-returned alike.
            await notifications.OnDecisionAsync(
                r.RequestId, r.UserId, "Reject", "Rejected", r.CurrentTier, actingTier: 0,
                "No clarification was provided within the allowed period.");
            _logger.LogInformation("Request {Id} auto-rejected (clarification timeout).", r.RequestId);
            await audit.LogAsync(r.RequestId, null,
                "Auto-rejected: no clarification was provided within the allowed period.");
        }

        // 3. Deferred requests past the deferred window → alert admins (name the officer who deferred).
        var deferredCutoff = now - EscalationPolicy.DeferredTimeout;
        foreach (var r in await requests.GetOverdueDeferredAsync(deferredCutoff))
        {
            await requests.RecordEscalationAsync(r.RequestId, r.CurrentTier);
            await requests.UpdateStatusAndTierAsync(r.RequestId, "Deferred", r.CurrentTier);
            await notifications.OnAdminAlertAsync(
                r.RequestId,
                $"Request #{r.RequestId} has been deferred at Finance beyond the allowed period and needs attention.",
                responsibleOfficerId: r.ClaimedBy);
            // Only an officer currently holding the request is told they were slow…
            if (r.ClaimedBy is not null)
            {
                await notifications.OnSlowOfficerAsync(r.RequestId, r.ClaimedBy.Value, wentUpATier: false);
            }
            // …but the employee is always told (unconditional — the old indentation made this
            // look like part of the if; it never was, and that behaviour is kept).
            await notifications.OnEscalatedNotifyEmployeeAsync(r.RequestId, r.UserId, wentUpATier: false);
            _logger.LogInformation("Request {Id} deferred too long → admin alerted.", r.RequestId);
            await audit.LogAsync(r.RequestId, null,
                "Deferred beyond the allowed period — flagged to administrators.");
        }
    }
}