using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using System.Text.Json;
using backend.Data;
using backend.Models;
using backend.M1;

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

            // Feature 3: rule-based validation. Sets status + note; blocks the model on Rejected/Returned.
            var validationResult = await validation.ValidateAsync(request);
            request.Status = validationResult.Status;
            request.ValidationNote = validationResult.Note;

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
                // Validated but unclassified. Graceful degradation.
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
    }
}