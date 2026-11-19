using backend.Data;

namespace backend.Requests;

// Requester history — GET /api/users/{userId}/request-history
//
// Every request one employee has ever made, with the full record of each: contents, model
// priority + SHAP reasons, every approve / return / reject (tier, approver, reason or note),
// deferral, disbursement, and the whole audit trail — so an approver deciding on a new request
// can see how this person's earlier requests went. Shown on the request detail page (to staff)
// and on Admin → Users → History.
//
// Access: the four approver roles and the System Administrator — the same people who can already
// open any single request (CanViewRequest). Employees get 403: they see their own requests via
// /api/requests/mine and must not be able to look up colleagues.
public static class RequestHistoryEndpoints
{
    private static readonly string[] StaffRoles =
    {
        "Department Supervisor",
        "Welfare Officer",
        "Finance Officer",
        "HR Manager",
        "System Administrator",
    };

    public static void MapRequestHistoryEndpoints(this WebApplication app)
    {
        app.MapGet("/api/users/{userId:int}/request-history", async (
            int userId,
            IRequestHistoryRepository history) =>
        {
            var requester = await history.GetRequesterAsync(userId);
            if (requester is null)
            {
                return Results.NotFound(new { error = "User not found." });
            }

            // Five set-based reads, then stitch per request.
            var rows = (await history.GetRequestsAsync(userId)).ToList();
            var approvals = (await history.GetApprovalsAsync(userId)).ToLookup(a => a.RequestId);
            var payouts = (await history.GetDisbursementsAsync(userId)).ToDictionary(d => d.RequestId);
            var activity = (await history.GetActivityAsync(userId)).ToLookup(a => a.RequestId);

            var items = rows.Select(r =>
            {
                var item = new HistoricalRequestDto
                {
                    RequestId = r.RequestId,
                    Category = r.Category,
                    Amount = r.Amount,
                    Description = r.Description,
                    Status = r.Status,
                    CurrentTier = r.CurrentTier,
                    ValidationNote = r.ValidationNote,
                    DeferReason = r.DeferReason,
                    CreatedAt = r.CreatedAt,
                    UpdatedAt = r.UpdatedAt,
                    Salary = r.Salary,
                    EmploymentDurationMonths = r.EmploymentDurationMonths,
                    PriorityLevel = r.PriorityLevel,
                    Explanation = r.Explanation,
                    HasDocument = r.HasDocument,
                    DocumentName = r.DocumentName,
                    Approvals = approvals[r.RequestId].Select(a => new ApprovalHistoryItem
                    {
                        Tier = a.Tier,
                        ApproverName = a.ApproverName,
                        Decision = a.Decision,
                        Reason = a.Reason,
                        DecidedAt = a.DecidedAt,
                    }).ToList(),
                    Activity = activity[r.RequestId].Select(e => new HistoryActivityItem
                    {
                        Actor = e.ActorName ?? "System",
                        Action = e.Action,
                        LoggedAt = e.LoggedAt,
                    }).ToList(),
                };
                if (payouts.TryGetValue(r.RequestId, out var paid))
                {
                    item.Disbursement = new DisbursementInfo
                    {
                        Amount = paid.Amount,
                        Reference = paid.Reference,
                        Note = paid.Note,   // staff-only endpoint, so the Finance memo is included
                        DisbursedByName = paid.DisbursedByName ?? "Finance",
                        DisbursedAt = paid.DisbursedAt,
                    };
                }
                item.Outcome = OutcomeFor(item);
                return item;
            }).ToList();

            var summary = new RequesterHistorySummary
            {
                Total = items.Count,
                Disbursed = items.Count(i => i.Outcome.Kind == "Disbursed"),
                ApprovedAwaitingPayout = items.Count(i => i.Outcome.Kind == "Approved"),
                Rejected = items.Count(i => i.Outcome.Kind == "Rejected"),
                Pending = items.Count(i => i.Outcome.Kind is "Pending" or "Returned" or "Deferred"),
                TotalRequested = items.Sum(i => i.Amount),
                TotalDisbursed = items.Where(i => i.Disbursement is not null).Sum(i => i.Disbursement!.Amount),
                LastRequestAt = items.Count > 0 ? items.Max(i => i.CreatedAt) : null,
            };

            return Results.Ok(new RequesterHistoryDto
            {
                Requester = requester,
                Summary = summary,
                Requests = items,
            });
        })
        .RequireAuthorization(p => p.RequireRole(StaffRoles));
    }

    // The decision reached, in one line. Read from the request's status plus the approval /
    // disbursement rows that explain it; validation-stage outcomes (no approver) use the note.
    private static RequestOutcome OutcomeFor(HistoricalRequestDto r)
    {
        static string RoleName(int tier) => RoutingPolicy.RoleForTier(tier) ?? $"tier {tier}";
        var last = (string decision) => r.Approvals.LastOrDefault(a => a.Decision == decision);

        switch (r.Status)
        {
            case "Disbursed":
                return new RequestOutcome
                {
                    Kind = "Disbursed",
                    Summary = "Approved and paid out",
                    Reason = r.Disbursement?.Reference is { Length: > 0 } reference ? $"Payment reference {reference}" : null,
                    DecidedBy = r.Disbursement?.DisbursedByName,
                    DecidedAt = r.Disbursement?.DisbursedAt ?? r.UpdatedAt,
                };

            case "Approved":
            {
                var a = last("Approved");
                return new RequestOutcome
                {
                    Kind = "Approved",
                    Summary = "Fully approved, awaiting payout",
                    Reason = a?.Reason,
                    DecidedBy = a is null ? null : $"{a.ApproverName} ({RoleName(a.Tier)})",
                    DecidedAt = a?.DecidedAt ?? r.UpdatedAt,
                };
            }

            case "Rejected":
            {
                var a = last("Rejected");
                if (a is not null)
                {
                    return new RequestOutcome
                    {
                        Kind = "Rejected",
                        Summary = $"Rejected by the {RoleName(a.Tier)}",
                        Reason = a.Reason,
                        DecidedBy = a.ApproverName,
                        DecidedAt = a.DecidedAt,
                    };
                }
                // No approver rejected it: either the clarification timeout (EscalationWorker) or
                // rule-based validation did. The audit trail says which.
                var timedOut = r.Activity.LastOrDefault(e => e.Action.StartsWith("Auto-rejected"));
                return timedOut is not null
                    ? new RequestOutcome
                    {
                        Kind = "Rejected",
                        Summary = "Rejected automatically (no clarification in time)",
                        Reason = "No clarification was provided within the allowed period.",
                        DecidedBy = "System",
                        DecidedAt = timedOut.LoggedAt,
                    }
                    : new RequestOutcome
                    {
                        Kind = "Rejected",
                        Summary = "Rejected at validation",
                        Reason = r.ValidationNote,
                        DecidedBy = "System",
                        DecidedAt = r.UpdatedAt,
                    };
            }

            case "Returned":
            {
                var a = last("Returned");
                return a is not null
                    ? new RequestOutcome
                    {
                        Kind = "Returned",
                        Summary = $"Returned for changes by the {RoleName(a.Tier)}",
                        Reason = a.Reason,
                        DecidedBy = a.ApproverName,
                        DecidedAt = a.DecidedAt,
                    }
                    : new RequestOutcome
                    {
                        Kind = "Returned",
                        Summary = "Returned for changes at validation",
                        Reason = r.ValidationNote,
                        DecidedBy = "System",
                        DecidedAt = r.UpdatedAt,
                    };
            }

            case "Deferred":
            {
                // Deferrals aren't approval rows; the audit trail records who deferred and when.
                var deferred = r.Activity.LastOrDefault(e => e.Action.StartsWith("Deferred at Finance"));
                return new RequestOutcome
                {
                    Kind = "Deferred",
                    Summary = "Deferred by the Finance Officer",
                    // Older rows may lack defer_reason; the audit line carries it after the colon.
                    Reason = r.DeferReason
                        ?? (deferred?.Action.IndexOf(": ", StringComparison.Ordinal) is int i and >= 0
                            ? deferred!.Action[(i + 2)..]
                            : null),
                    DecidedBy = deferred?.Actor,
                    DecidedAt = deferred?.LoggedAt ?? r.UpdatedAt,
                };
            }

            default:   // Submitted / Validated / In Review / Escalated — still in the workflow
                return new RequestOutcome
                {
                    Kind = "Pending",
                    Summary = r.CurrentTier >= 1
                        ? $"{(r.Status == "Escalated" ? "Escalated" : "In review")} with the {RoleName(r.CurrentTier)}"
                        : "Awaiting validation",
                };
        }
    }
}
