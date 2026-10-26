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

        // Any authenticated user can submit a request. Accepts multipart form data so an
        // optional supporting document can be uploaded in the same step.
        group.MapPost("/", async (
            HttpRequest httpRequest,
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IValidationService validation,
            IModelService modelService,
            IPriorityPredictionRepository predictions,
            IDocumentRepository documents) =>
        {
            // Identify submitter from the token, not the request body.
            var userIdClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);

            if (userIdClaim is null || !int.TryParse(userIdClaim, out var userId))
            {
                return Results.Unauthorized();
            }

            // Read the fields from the multipart form (instead of a JSON DTO).
            if (!httpRequest.HasFormContentType)
            {
                return Results.BadRequest(new { error = "Expected multipart form data." });
            }
            var form = await httpRequest.ReadFormAsync();

            var category = form["category"].ToString();
            var description = form["description"].ToString();
            decimal.TryParse(form["amount"], out var amount);
            decimal.TryParse(form["salary"], out var salaryVal);
            int.TryParse(form["employmentDurationMonths"], out var employmentMonths);
            int.TryParse(form["hasDocuments"], out var hasDocumentsFlag);

            // Basic validation of the submitted values.
            if (string.IsNullOrWhiteSpace(category) || amount <= 0)
            {
                return Results.BadRequest(new { error = "Category and a positive amount are required." });
            }

            // If a file was attached, read and validate it BEFORE creating anything,
            // so a bad file is rejected cleanly rather than leaving a half-saved request.
            var file = form.Files.GetFile("document");
            byte[]? fileBytes = null;
            string? fileContentType = null;
            string? fileName = null;

            if (file is not null && file.Length > 0)
            {
                const long maxBytes = 5 * 1024 * 1024; // 5 MB cap
                if (file.Length > maxBytes)
                {
                    return Results.BadRequest(new { error = "File must be 5 MB or smaller." });
                }

                using var ms = new MemoryStream();
                await file.CopyToAsync(ms);
                fileBytes = ms.ToArray();

                fileContentType = SniffAllowedContentType(fileBytes);
                if (fileContentType is null)
                {
                    return Results.BadRequest(new { error = "Only PDF, JPEG, or PNG files are allowed." });
                }
                fileName = Path.GetFileName(file.FileName);
            }

            // System-derived history fields.
            var previousRequests = await requests.CountByUserAsync(userId);
            var oneYearAgo = DateTime.UtcNow.AddYears(-1);
            var requestFrequency = await requests.CountByUserSinceAsync(userId, oneYearAgo);

            var request = new WelfareRequest
            {
                UserId = userId,
                Category = category,
                Amount = amount,
                Description = string.IsNullOrWhiteSpace(description) ? null : description,
                Salary = salaryVal,
                EmploymentDurationMonths = employmentMonths,
                PreviousRequests = previousRequests,
                RequestFrequency = requestFrequency,
                // A real uploaded file is the source of truth for has-documents; fall back
                // to the form's checkbox if no file was attached.
                HasDocuments = fileBytes is not null ? 1 : hasDocumentsFlag,
                Status = "Submitted",
                CurrentTier = 0,
            };

            // Feature 3: rule-based validation.
            var validationResult = await validation.ValidateAsync(request);
            request.ValidationNote = validationResult.Note;

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

            // Store the request first so we have its id (for the prediction and the document).
            var newId = await requests.CreateAsync(request);

            // If a valid file was attached, store it against the new request. Best-effort:
            // a document write failure must not lose an otherwise valid request.
            if (fileBytes is not null)
            {
                try
                {
                    await documents.CreateAsync(new Document
                    {
                        RequestId = newId,
                        FileName = fileName ?? "document",
                        ContentType = fileContentType!,
                        FileBytes = fileBytes,
                    });
                }
                catch
                {
                    // Swallow — the request stands; the document simply wasn't saved.
                }
            }

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
        .RequireAuthorization()
        .DisableAntiforgery();

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

                // Download the supporting document for a request. Same access rule as the detail
        // endpoint: an approver may view any request's document; an employee only their own.
        group.MapGet("/{id:int}/document", async (
            int id,
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IDocumentRepository documents) =>
        {
            var request = await requests.GetByIdAsync(id);
            if (request is null)
            {
                return Results.NotFound(new { error = "Request not found." });
            }

            // Authorise: approver (any) or the owning employee (their own only).
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

            var doc = await documents.GetByRequestIdAsync(id);
            if (doc is null || doc.FileBytes.Length == 0)
            {
                return Results.NotFound(new { error = "No document attached to this request." });
            }

            // Stream the bytes back with the right content type. "inline" lets the browser
            // display a PDF/image in a tab rather than forcing a download.
            return Results.File(doc.FileBytes, doc.ContentType, doc.FileName, enableRangeProcessing: false);
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
    // Validate an uploaded file by its real content (magic bytes), not its extension.
    // Returns a normalised content type ("application/pdf" | "image/jpeg" | "image/png")
    // or null if the file is not an allowed type. Allowed: PDF, JPEG, PNG.
    private static string? SniffAllowedContentType(byte[] bytes)
    {
        if (bytes.Length < 4) return null;

        // PDF: "%PDF"
        if (bytes[0] == 0x25 && bytes[1] == 0x50 && bytes[2] == 0x44 && bytes[3] == 0x46)
            return "application/pdf";

        // JPEG: FF D8 FF
        if (bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF)
            return "image/jpeg";

        // PNG: 89 50 4E 47
        if (bytes[0] == 0x89 && bytes[1] == 0x50 && bytes[2] == 0x4E && bytes[3] == 0x47)
            return "image/png";

        return null;
    }
}