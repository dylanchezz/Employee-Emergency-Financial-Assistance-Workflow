using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using backend.Data;
using backend.Models;
using backend.M1;
using System.Text.RegularExpressions;

namespace backend.Requests;

public static class RequestEndpoints
{
    public static void MapRequestEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/requests");

        //Any authenticated user can submit a request
        group.MapPost("/", async (
            SubmitRequestDto dto,
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IValidationService validation,
            IModelService modelService,
            IPriorityPredictionRepository predictions) =>
        {
            //Identify submitter from token not request body
            var userIdClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);

            if (userIdClaim is null || !int.TryParse(userIdClaim, out var userId))
            {
                return Results.Unauthorized();
            }

            // Basic validation of the submitted values.
            if (string.IsNullOrWhiteSpace(dto.Category) || dto.Amount <= 0)
            {
                return Results.BadRequest(new { error = "Category and a positive amount are required." });
            }

            //System derived history fields
            var previousRequests = await requests.CountByUserAsync(userId);
            var oneYearAgo = DateTime.UtcNow.AddYears(-1);
            var requestFrequency = await requests.CountByUserSinceAsync(userId, oneYearAgo);

            var request = new WelfareRequest
            {
                UserId = userId,
                Category = dto.Category,
                Amount = dto.Amount,
                Description = dto.Description,
                Salary = dto.Salary,
                EmploymentDurationMonths = dto.EmploymentDurationMonths,
                PreviousRequests = previousRequests,
                RequestFrequency = requestFrequency,
                HasDocuments = dto.HasDocuments,
                Status = "Submitted",
                CurrentTier = 0,
            };

            // Feature 3: rule-based validation.
            var validationResult = await validation.ValidateAsync(request);
            request.ValidationNote = validationResult.Note;

            // On pass, the request enters the approval workflow at tier 1 ("In Review").
            // Rejected/Returned keep their status and stay at tier 0.
            if (validationResult.Outcome == ValidationOutcome.Validated)
            {
                request.Status = "In Review";
                request.CurrentTier = 1;
            }
            else
            {
                request.Status = validationResult.Status;  // "Rejected" or "Returned"
                request.CurrentTier = 0;
            }

            // Store the request first so we have its id for the prediction.
            var newId = await requests.CreateAsync(request);

            // Feature 4: classify ONLY validated requests. Rejected/Returned skip the model.
            string? priority = null;
            if (validationResult.Outcome == ValidationOutcome.Validated)
            {
                var predictRequest = new PredictRequest
                {
                    RequestCategory = request.Category,
                    RequestedAmount = request.Amount,
                    Salary = request.Salary ?? 0,
                    EmploymentDurationMonths = request.EmploymentDurationMonths ?? 0,
                    PreviousRequests = request.PreviousRequests ?? 0,
                    RequestFrequency = request.RequestFrequency ?? 0,
                    HasDocuments = request.HasDocuments ?? 0,
                };

                var prediction = await modelService.PredictAsync(predictRequest);

                if (prediction is not null)
                {
                    priority = prediction.Priority;
                    await predictions.CreateAsync(new PriorityPrediction
                    {
                        RequestId = newId,
                        PriorityLevel = prediction.Priority,
                        Explanation = JsonSerializer.Serialize(prediction.Explanation),
                    });
                }
                // If prediction is null (model service down/timed out), the request stays
                // In Review but unclassified. Graceful degradation.
            }

            return Results.Created($"/api/requests/{newId}", new
            {
                requestId = newId,
                status = request.Status,
                note = request.ValidationNote,
                priority,
                previousRequests = request.PreviousRequests,
                requestFrequency = request.RequestFrequency,
            });
        })
        .RequireAuthorization();

        // The approver's queue: In-Review requests at their tier, priority-ordered.
        group.MapGet("/queue", async (
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests) =>
        {
            var role = principal.FindFirstValue(ClaimTypes.Role);
            var tier = TierForRole(role);
            if (tier is null)
            {
                // Not an approver role (e.g. Employee / Admin) — no queue.
                return Results.Forbid();
            }

            var queue = await requests.GetQueueForTierAsync(tier.Value);
            return Results.Ok(queue);
        })
        .RequireAuthorization();
        
        // Full detail for one request: fields + prediction + approval history.
        group.MapGet("/{id:int}", async (
            int id,
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IUserRepository users,
            IPriorityPredictionRepository predictions,
            IApprovalRepository approvals) =>
        {

            var request = await requests.GetByIdAsync(id);
            if (request is null)
            {
                return Results.NotFound(new { error = "Request not found. "});
            }
        
            //An Approver may view any request while an employee only views their own.
            var role = principal.FindFirstValue(ClaimTypes.Role);
            var viewerIdClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            int.TryParse(viewerIdClaim, out var viewerId);
            var isApprover = TierForRole(role) is not null;
            var isOwner = request.UserId == viewerId;
            if (!isApprover && !isOwner)
            {
                return Results.Forbid();
            }
            var requesterName = await users.GetNameByIdAsync(request.UserId) ?? "Unknown";
            var prediction = await predictions.GetByRequestIdAsync(id);
            var history = await approvals.GetHistoryForRequestAsync(id);

            var detail = new RequestDetailDto
            {
                RequestId = request.RequestId,
                RequesterName = requesterName,
                Category = request.Category,
                Amount = request.Amount,
                Description = request.Description,
                Status = request.Status,
                CurrentTier = request.CurrentTier,
                HasDocuments = request.HasDocuments,
                ValidationNote = request.ValidationNote,
                CreatedAt = request.CreatedAt,
                PriorityLevel = prediction?.PriorityLevel,
                Explanation = prediction?.Explanation,
                Approvals = history.ToList(),
            };
            return Results.Ok(detail);
        })
        .RequireAuthorization();
 

        // The logged-in employee's own requests (any status), newest first.
        group.MapGet("/mine", async (
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests) =>
        {
            var userIdClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userIdClaim is null || !int.TryParse(userIdClaim, out var userId))
            {
                return Results.Unauthorized();
            }

            var mine = await requests.GetByUserAsync(userId);
            return Results.Ok(mine);
        })
        .RequireAuthorization();

        // An approver acts on a request at their tier: approve / reject / return.
        group.MapPost("/{id:int}/decision", async (
            int id,
            DecisionDto dto,
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IApprovalRepository approvals) =>
        {
            // Who is acting, and at what tier.
            var approverIdClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (approverIdClaim is null || !int.TryParse(approverIdClaim, out var approverId))
            {
                return Results.Unauthorized();
            }

            var role = principal.FindFirstValue(ClaimTypes.Role);
            var approverTier = TierForRole(role);
            if (approverTier is null)
            {
                return Results.Forbid();  // not an approver role
            }

            // The request must exist, be In Review, and be at this approver's tier.
            var request = await requests.GetByIdAsync(id);
            if (request is null)
            {
                return Results.NotFound(new { error = "Request not found." });
            }
            if (request.Status != "In Review" || request.CurrentTier != approverTier.Value)
            {
                return Results.BadRequest(new { error = "This request is not awaiting your decision." });
            }

            // Normalise the decision and enforce the reason rule.
            var decision = dto.Decision?.Trim();
            if (decision is not ("Approve" or "Reject" or "Return"))
            {
                return Results.BadRequest(new { error = "Decision must be Approve, Reject, or Return." });
            }
            if ((decision is "Reject" or "Return") && string.IsNullOrWhiteSpace(dto.Reason))
            {
                return Results.BadRequest(new { error = "A reason is required to reject or return a request." });
            }

            // Record the approval event (maps to the approvals.decision values).
            var recordedDecision = decision switch
            {
                "Approve" => "Approved",
                "Reject"  => "Rejected",
                "Return"  => "Returned",
                _ => decision
            };
            await approvals.CreateAsync(new Approval
            {
                RequestId = id,
                ApproverId = approverId,
                Tier = approverTier.Value,
                Decision = recordedDecision,
                Reason = dto.Reason,
            });

            // Route the request based on the decision.
            string newStatus;
            int newTier;
            switch (decision)
            {
                case "Approve":
                    if (approverTier.Value >= 4)
                    {
                        newStatus = "Approved";   // final tier (HR) approved
                        newTier = 4;
                    }
                    else
                    {
                        newStatus = "In Review";  // advance to the next tier
                        newTier = approverTier.Value + 1;
                    }
                    break;

                case "Reject":
                    newStatus = "Rejected";
                    newTier = approverTier.Value;
                    break;

                default: // Return
                    newStatus = "Returned";
                    newTier = approverTier.Value;
                    break;
            }

            await requests.UpdateStatusAndTierAsync(id, newStatus, newTier);

            return Results.Ok(new
            {
                requestId = id,
                decision = recordedDecision,
                status = newStatus,
                currentTier = newTier,
            });
        })
        .RequireAuthorization();

                // Requests this approver has personally decided on (any current status).
        group.MapGet("/my-decisions", async (
            ClaimsPrincipal principal,
            IApprovalRepository approvals) =>
        {
            var role = principal.FindFirstValue(ClaimTypes.Role);
            if (TierForRole(role) is null)
            {
                return Results.Forbid();  // approvers only
            }

            var idClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (idClaim is null || !int.TryParse(idClaim, out var approverId))
            {
                return Results.Unauthorized();
            }

            var decided = await approvals.GetRequestsDecidedByAsync(approverId);
            return Results.Ok(decided);
        })
        .RequireAuthorization();
        
    }


    // Maps an approver role to its workflow tier (null for non-approver roles).
    private static int? TierForRole(string? role) => role switch
    {
        "Department Supervisor" => 1,
        "Welfare Officer"       => 2,
        "Finance Officer"       => 3,
        "HR Manager"            => 4,
        _ => null,
    };
}