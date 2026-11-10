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
            IDocumentRepository documents,
            INotificationService notifications,
            IAuditRepository audit,
            IUserRepository users) =>
        {
            // Identify submitter from the token, not the request body.
            var userIdClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);

            if (userIdClaim is null || !int.TryParse(userIdClaim, out var userId))
            {
                return Results.Unauthorized();
            }

            // D1: the submitter's role and department, read fresh from the DB (the token carries
            // the role but not the department, and an admin may have changed either since login).
            var submitter = await users.GetByIdAsync(userId);
            if (submitter is null)
            {
                return Results.Unauthorized();
            }

            // D1 complete-profile gate: tier-1 routing needs a real department, so an
            // "Unassigned" account (e.g. a Google sign-up, A27) must choose one first.
            // Enforced HERE, not only in the UI.
            if (submitter.Department == RoutingPolicy.UnassignedDepartment)
            {
                return Results.BadRequest(new
                {
                    error = "Please choose your department before submitting a request.",
                    needsDepartment = true,
                });
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
                // D1: THE entry-tier decision (one place — RoutingPolicy). Normally tier 1 (the
                // employee's own Department Supervisor); a supervisor's own request enters at 2.
                request.CurrentTier = RoutingPolicy.InitialTierFor(submitter.Role);
            }
            else
            {
                request.Status = validationResult.Status;  // "Rejected" or "Returned"
                request.CurrentTier = 0;
            }

            // Store the request first so we have its id (for the prediction and the document).
            var newId = await requests.CreateAsync(request);
            // If validation stopped the request at submission, tell the employee.
            await notifications.OnSubmissionOutcomeAsync(
                newId, userId, request.Status, request.ValidationNote, entryTier: request.CurrentTier);

            // Audit: the submission, and the validation outcome (the actor is the employee).
            await audit.LogAsync(newId, userId, "Submitted the request.");
            await audit.LogAsync(newId, userId, request.Status switch
            {
                "In Review" => request.CurrentTier == 1
                    ? "Passed rule-based validation."
                    : $"Passed rule-based validation. Entered review at tier {request.CurrentTier} (a Department Supervisor's own request skips tier 1).",
                "Rejected"  => $"Rejected at validation: {request.ValidationNote}",
                "Returned"  => $"Returned at validation: {request.ValidationNote}",
                _           => $"Validation outcome: {request.Status}",
            });

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
                    // Audit: classification is a system action (no human actor).
                    await audit.LogAsync(newId, null, $"Classified as {prediction.Priority} priority by the model.");
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

        // Resubmit a RETURNED request after the employee has clarified/edited it.
        // Same request_id (history preserved): we update the editable fields, re-run
        // Feature 3 validation and — if it passes — Feature 4 classification, then put the
        // request back In Review at the tier that returned it. Owner-only, Returned-only.
        group.MapPost("/{id:int}/resubmit", async (
            int id,
            HttpRequest httpRequest,
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IApprovalRepository approvals,
            IUserRepository users,
            IValidationService validation,
            IModelService modelService,
            IPriorityPredictionRepository predictions,
            IDocumentRepository documents,
            IClaimRepository claims,
            INotificationService notifications,
            IAuditRepository audit) =>
        {
            // Identify the caller from the token.
            var userIdClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userIdClaim is null || !int.TryParse(userIdClaim, out var userId))
            {
                return Results.Unauthorized();
            }

            var request = await requests.GetByIdAsync(id);
            if (request is null)
            {
                return Results.NotFound(new { error = "Request not found." });
            }

            // Only the owning employee may resubmit, and only a Returned request.
            if (request.UserId != userId)
            {
                return Results.Forbid();
            }
            if (request.Status != "Returned")
            {
                return Results.BadRequest(new { error = "Only a returned request can be resubmitted." });
            }

            if (!httpRequest.HasFormContentType)
            {
                return Results.BadRequest(new { error = "Expected multipart form data." });
            }
            var form = await httpRequest.ReadFormAsync();

            // On resubmit the whole request is editable: amount, description, category, and
            // the document. (The returning tier still comes from history, so changing the
            // category doesn't change where the request goes back to.)
            var category = form["category"].ToString();
            var description = form["description"].ToString();
            decimal.TryParse(form["amount"], out var amount);
            if (string.IsNullOrWhiteSpace(category) || amount <= 0)
            {
                return Results.BadRequest(new { error = "Category and a positive amount are required." });
            }

            // Validate any newly attached file BEFORE changing anything.
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

            // Apply the edits to the in-memory request. has_documents becomes true if a new
            // file was attached now, OR the request already had a document from before.
            request.Category = category;
            request.Amount = amount;
            request.Description = string.IsNullOrWhiteSpace(description) ? null : description;
            var hadDocumentBefore = (request.HasDocuments ?? 0) == 1;
            request.HasDocuments = (fileBytes is not null || hadDocumentBefore) ? 1 : 0;

            // Feature 3: re-run validation on the edited request. Pass this request's id so
            // validation excludes it from its own duplicate / annual-limit checks — an edited
            // clarification is not a duplicate of itself.
            var validationResult = await validation.ValidateAsync(request, excludeRequestId: id);
            request.ValidationNote = validationResult.Note;

            // Persist the edited fields + validation note (same request_id, history kept).
            await requests.UpdateEditableFieldsAsync(request);

            // If a new file was attached, store it against the request (best-effort).
            if (fileBytes is not null)
            {
                try
                {
                    await documents.CreateAsync(new Document
                    {
                        RequestId = id,
                        FileName = fileName ?? "document",
                        ContentType = fileContentType!,
                        FileBytes = fileBytes,
                    });
                }
                catch
                {
                    // The resubmission stands; the document simply wasn't saved.
                }
            }

            // Audit: the employee resubmitted (the actor is the employee).
            await audit.LogAsync(id, userId, "Resubmitted the request with clarifications.");

            // Validation failed again → the request stops here (Rejected/Returned), same as
            // a fresh submission. Notify the employee and do not re-enter the queue.
            if (validationResult.Outcome != ValidationOutcome.Validated)
            {
                await requests.UpdateStatusAndTierAsync(id, validationResult.Status, 0);
                await notifications.OnSubmissionOutcomeAsync(
                    id, userId, validationResult.Status, request.ValidationNote, entryTier: 0);
                await audit.LogAsync(id, userId, validationResult.Status == "Rejected"
                    ? $"Rejected again at validation on resubmit: {request.ValidationNote}"
                    : $"Returned again at validation on resubmit: {request.ValidationNote}");
                return Results.Ok(new
                {
                    requestId = id,
                    status = validationResult.Status,
                    note = request.ValidationNote,
                });
            }

            // Validation passed → re-classify (Feature 4). Keep the old prediction: migration
            // 008 dropped the UNIQUE on request_id, so this INSERT adds a NEW prediction row
            // and the detail endpoint reads the latest. History shows "was X -> now Y".
            string? priority = null;
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
                    RequestId = id,
                    PriorityLevel = prediction.Priority,
                    Explanation = JsonSerializer.Serialize(prediction.Explanation),
                });
            }

            // Re-enter at the tier that returned it (design choice). If there's no approver
            // Returned record (e.g. it was returned by the automatic checks), fall back to the
            // request's normal entry tier — D1: the SAME RoutingPolicy decision as a fresh
            // submit, so a supervisor's own request still skips tier 1 here too.
            var ownerRole = await users.GetRoleByIdAsync(userId) ?? "Employee";
            var returningTier = await approvals.GetReturningTierAsync(id)
                ?? RoutingPolicy.InitialTierFor(ownerRole);

            // Clear any stale claim first — a resubmit starts a fresh review cycle.
            if (request.ClaimedBy is not null)
            {
                await claims.ReleaseAsync(id, request.ClaimedBy.Value);
            }

            // Prefer to send it back to the SAME approver who returned it (they asked for the
            // clarification). Only if they still staff that tier can we pre-assign to them;
            // otherwise it falls back to the shared tier pool so it's never stuck.
            var returningApprover = await approvals.GetReturningApproverAsync(id);
            int? preAssignedTo = null;
            if (returningApprover is not null)
            {
                var approverRole = await users.GetRoleByIdAsync(returningApprover.Value);
                if (approverRole is not null && TierForRole(approverRole) == returningTier)
                {
                    preAssignedTo = returningApprover;
                }
            }

            // Set status/tier (bumps updated_at → resets the escalation clock for this cycle).
            await requests.UpdateStatusAndTierAsync(id, "In Review", returningTier);

            // If the original approver is still eligible, pre-claim it to them (no claim event,
            // so it doesn't count against their cap — they're continuing earlier work).
            if (preAssignedTo is not null)
            {
                await claims.PreAssignAsync(id, preAssignedTo.Value);
            }

            // Notify. If pre-assigned, tell that one officer; otherwise tell the whole tier.
            await notifications.OnResubmittedAsync(id, userId, returningTier, preAssignedTo);

            // Audit: the re-classification (system) and the re-entry into review.
            if (priority is not null)
            {
                await audit.LogAsync(id, null, $"Re-classified as {priority} priority on resubmit.");
            }
            await audit.LogAsync(id, null,
                $"Re-entered review at tier {returningTier}" +
                (preAssignedTo is not null ? " (assigned to the returning approver)." : " (shared queue)."));

            return Results.Ok(new
            {
                requestId = id,
                status = "In Review",
                currentTier = returningTier,
                priority,
            });
        })
        .RequireAuthorization()
        .DisableAntiforgery();

        // The approver's queue: unclaimed (or self-held) requests at their tier, priority-ordered.
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

            var idClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (idClaim is null || !int.TryParse(idClaim, out var approverId))
            {
                return Results.Unauthorized();
            }

            var queue = await requests.GetQueueForTierAsync(tier.Value, approverId);
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
        
            // Shared read-access rule (see CanViewRequest) — the document endpoint uses the same one.
            if (!CanViewRequest(principal, request))
            {
                return Results.Forbid();
            }
            var requesterName = await users.GetNameByIdAsync(request.UserId) ?? "Unknown";
            var prediction = await predictions.GetByRequestIdAsync(id);
            var history = await approvals.GetHistoryForRequestAsync(id);
            //Prediction Trail
            var predictionTrail = await predictions.GetAllByRequestIdAsync(id);

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
                DeferReason = request.DeferReason,
                PriorityLevel = prediction?.PriorityLevel,
                Explanation = prediction?.Explanation,
                ClaimedBy = request.ClaimedBy,
                Approvals = history.ToList(),
                PredictionHistory = predictionTrail
                    .Select(p => new PredictionHistoryItem
                    {
                        PriorityLevel = p.PriorityLevel,
                        PredictedAt = p.PredictedAt,
                    })
                    .ToList(),
            };
            return Results.Ok(detail);
        })
        .RequireAuthorization();

        // Download the supporting document for a request. Same access rule as the detail
        // endpoint: an approver or administrator may view any request's document; an
        // employee only their own.
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

            // Same read-access rule as the detail endpoint — literally the same check, so the
            // two can't drift apart again (that drift is what left admins locked out here).
            if (!CanViewRequest(principal, request))
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

                // An approver claims a request from their tier's shared queue, locking it to
        // themselves. Enforces the per-approver claim cap.
        group.MapPost("/{id:int}/claim", async (
            int id,
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IClaimRepository claims,
            INotificationService notifications,
            IUserRepository users) =>
        {
            var role = principal.FindFirstValue(ClaimTypes.Role);
            var approverTier = TierForRole(role);
            if (approverTier is null)
            {
                return Results.Forbid();  // not an approver role
            }

            var idClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (idClaim is null || !int.TryParse(idClaim, out var approverId))
            {
                return Results.Unauthorized();
            }

            var request = await requests.GetByIdAsync(id);
            if (request is null)
            {
                return Results.NotFound(new { error = "Request not found." });
            }

            // Separation of duties: an approver may never take their own request — any
            // authenticated user (approvers included) can submit, so without this an approver
            // could submit a request and then claim + approve it themselves.
            if (request.UserId == approverId)
            {
                return Results.Json(
                    new { error = "You cannot claim a request you submitted yourself. Another officer at your tier must review it." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            // D1: tier 1 is department-scoped — the queue already hides other departments'
            // requests, but the API must refuse them too (a hidden button is not a rule).
            if (!await IsWithinDepartmentScopeAsync(approverTier.Value, approverId, request, users))
            {
                return Results.Json(
                    new { error = "This request belongs to another department's supervisors." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            // Claimable when it's at this approver's tier AND either In Review, or
            // Deferred at the Finance tier (so Finance can re-claim a deferred request).
            var claimable =
                request.CurrentTier == approverTier.Value &&
                (request.Status == "In Review" ||
                 (request.Status == "Deferred" && approverTier.Value == 3));
            if (!claimable)
            {
                return Results.BadRequest(new { error = "This request is not available at your tier." });
            }

            // Must be unclaimed (or already held by this same approver — treat as a no-op success).
            if (request.ClaimedBy is not null && request.ClaimedBy != approverId)
            {
                return Results.BadRequest(new { error = "This request is already claimed by another officer." });
            }

            // Enforce the per-approver claim cap.
            var priorClaims = await claims.CountClaimsByApproverAsync(id, approverId);
            if (priorClaims >= ClaimPolicy.MaxClaimsPerApprover)
            {
                return Results.BadRequest(new
                {
                    error = $"You have already claimed this request {ClaimPolicy.MaxClaimsPerApprover} times and can no longer claim it. Another officer at your tier can take it."
                });
            }

            // The write is conditional (see ClaimAsync): if another officer claimed it between
            // our check above and this write, we lose the race and get the same response as
            // if we'd seen their claim up front.
            var claimed = await claims.ClaimAsync(id, approverId);
            if (!claimed)
            {
                return Results.BadRequest(new { error = "This request is already claimed by another officer." });
            }
            return Results.Ok(new { requestId = id, claimedBy = approverId });
        })
        .RequireAuthorization();

                // The holder releases a request back to the shared queue. Note: releasing does
        // NOT reset the claim count — that's what makes the cap meaningful.
        group.MapPost("/{id:int}/release", async (
            int id,
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IClaimRepository claims) =>
        {
            var idClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
                ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
            if (idClaim is null || !int.TryParse(idClaim, out var approverId))
            {
                return Results.Unauthorized();
            }

            var request = await requests.GetByIdAsync(id);
            if (request is null)
            {
                return Results.NotFound(new { error = "Request not found." });
            }

            // Only the current holder may release it.
            if (request.ClaimedBy != approverId)
            {
                return Results.BadRequest(new { error = "You do not currently hold this request." });
            }

            await claims.ReleaseAsync(id, approverId);
            return Results.Ok(new { requestId = id, released = true });
        })
        .RequireAuthorization();

        // An approver acts on a request at their tier: approve / reject / return.
        group.MapPost("/{id:int}/decision", async (
            int id,
            DecisionDto dto,
            ClaimsPrincipal principal,
            IWelfareRequestRepository requests,
            IApprovalRepository approvals,
            IClaimRepository claims,
            INotificationService notifications,
            IAuditRepository audit,
            IUserRepository users) =>
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
            // Separation of duties (second line of defence — the claim endpoint already blocks
            // this, but a decision must never be recorded by the request's own submitter, even
            // if they somehow hold the claim, e.g. a claim taken before this guard existed).
            if (request.UserId == approverId)
            {
                return Results.Json(
                    new { error = "You cannot decide a request you submitted yourself." },
                    statusCode: StatusCodes.Status403Forbidden);
            }
            // D1 second line of defence, same idea as the self-approval guard above: a tier-1
            // decision must come from a supervisor of the employee's department, even if they
            // somehow hold the claim (e.g. a resubmit pre-assignment after an admin moved them).
            if (!await IsWithinDepartmentScopeAsync(approverTier.Value, approverId, request, users))
            {
                return Results.Json(
                    new { error = "This request belongs to another department's supervisors." },
                    statusCode: StatusCodes.Status403Forbidden);
            }
            // Actionable when it's at this approver's tier AND either In Review, or Deferred
            // at the Finance tier (so Finance can resolve a deferred request).
            var actionable =
                request.CurrentTier == approverTier.Value &&
                (request.Status == "In Review" ||
                 (request.Status == "Deferred" && approverTier.Value == 3));
            if (!actionable)
            {
                return Results.BadRequest(new { error = "This request is not awaiting your decision." });
            }
            // Pull-based lock: you can only decide a request you currently hold.
            if (request.ClaimedBy != approverId)
            {
                return Results.BadRequest(new { error = "Claim this request before acting on it." });
            }

            // Normalise the decision and enforce the reason rule.
            var decision = dto.Decision?.Trim();
            if (decision is not ("Approve" or "Reject" or "Return" or "Defer"))
            {
                return Results.BadRequest(new { error = "Decision must be Approve, Reject, Return, or Defer." });
            }
            // Defer is a Finance-tier (3) action only.
            if (decision == "Defer" && approverTier.Value != 3)
            {
                return Results.BadRequest(new { error = "Only the Finance Officer can defer a request." });
            }
            if ((decision is "Reject" or "Return" or "Defer") && string.IsNullOrWhiteSpace(dto.Reason))
            {
                return Results.BadRequest(new { error = "A reason is required to reject, return, or defer a request." });
            }


            // Defer isn't an approvals-table decision (that CHECK allows only
            // Approved/Rejected/Returned); the status change + claim event record it.
            if (decision != "Defer")
            {   
                var recordedDecision = decision switch
                 {
                    "Approve" => "Approved",
                    "Reject"  => "Rejected",
                    "Return"  => "Returned",
                _       => decision
                };
                await approvals.CreateAsync(new Approval
                {
                    RequestId = id,
                    ApproverId = approverId,
                    Tier = approverTier.Value,
                    Decision = recordedDecision,
                    Reason = dto.Reason,
                });
            }

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

                case "Defer":
                    newStatus = "Deferred";       // Finance: funds temporarily unavailable
                    newTier = approverTier.Value; // stays at the Finance tier, re-actionable later
                    break;

                default: // Return
                    newStatus = "Returned";
                    newTier = approverTier.Value;
                    break;
            }

            await requests.UpdateStatusAndTierAsync(id, newStatus, newTier);
            // Persist the defer reason on the request (approvals can't hold a Deferred row).
            if (decision == "Defer")
            {
                await requests.SetDeferReasonAsync(id, dto.Reason!.Trim());
                // A deferral shouldn't consume the claim cap — give the officer their claim
                // back so they can re-claim and resolve the request later.
                await claims.RemoveLatestClaimAsync(id, approverId);
            }

            // A decision ends the holder's lock — release the claim so the request can be
            // picked up again if it stays in play (advanced to the next tier, or deferred).
            await claims.ReleaseAsync(id, approverId);

            // Notify the employee of the outcome, and the next tier's approvers if it advanced.
            await notifications.OnDecisionAsync(
                requestId: id,
                employeeId: request.UserId,
                decision: decision!,
                newStatus: newStatus,
                nextTier: newTier,
                actingTier: approverTier.Value,
                reason: dto.Reason);

            // Audit: record the decision (the actor is the approver who made it).
            var auditAction = decision switch
            {
                "Approve" when newStatus == "Approved" => $"Fully approved at HR (tier {approverTier.Value}).",
                "Approve" => $"Approved at tier {approverTier.Value}; advanced to tier {newTier}.",
                "Reject"  => $"Rejected at tier {approverTier.Value}: {dto.Reason}",
                "Return"  => $"Returned for clarification at tier {approverTier.Value}: {dto.Reason}",
                "Defer"   => $"Deferred at Finance (tier {approverTier.Value}): {dto.Reason}",
                _         => $"Decision '{decision}' at tier {approverTier.Value}.",
            };
            await audit.LogAsync(id, approverId, auditAction);

            return Results.Ok(new
            {
                requestId = id,
                decision,
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


    // Read access to one request (its detail AND its document): an approver or an
    // administrator may view any request (the admin as a read-only privileged viewer); an
    // employee only their own. ONE definition, used by both endpoints — previously each had
    // its own copy, and the admin rule was added to one but not the other (A24 bug #1).
    private static bool CanViewRequest(ClaimsPrincipal principal, WelfareRequest request)
    {
        var role = principal.FindFirstValue(ClaimTypes.Role);
        var viewerIdClaim = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        int.TryParse(viewerIdClaim, out var viewerId);

        var isApprover = TierForRole(role) is not null;
        var isAdmin = role == "System Administrator";
        var isOwner = request.UserId == viewerId;
        return isApprover || isAdmin || isOwner;
    }

    // Maps an approver role to its workflow tier (null for non-approver roles).
    // D1: is this approver allowed to act on this request, department-wise? Only tier 1 is
    // department-scoped; tiers 2–4 always pass. Shared by the claim AND decide endpoints so the
    // two enforcement points can't drift apart (the A24 fix-7 lesson). Departments are read
    // from the DB, never from the token.
    private static async Task<bool> IsWithinDepartmentScopeAsync(
        int approverTier, int approverId, WelfareRequest request, IUserRepository users)
    {
        if (approverTier != RoutingPolicy.DepartmentScopedTier)
        {
            return true;
        }
        var approverDepartment = await users.GetDepartmentByIdAsync(approverId);
        var ownerDepartment = await users.GetDepartmentByIdAsync(request.UserId);
        return approverDepartment is not null && approverDepartment == ownerDepartment;
    }

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