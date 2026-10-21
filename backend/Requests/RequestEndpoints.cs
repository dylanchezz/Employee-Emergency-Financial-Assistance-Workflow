using System.Security.Claims;
using System.IdentityModel.Tokens.Jwt;
using backend.Data;
using backend.Models;

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
            IValidationService validation) =>
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
                return Results.BadRequest(new { error = "Category and posifitve amount required"});  
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

            // --- Feature 4 (model classification) will slot in here:
            // --- only when validationResult.Outcome == ValidationOutcome.Validated.

            var newId = await requests.CreateAsync(request);

            return Results.Created($"/api/requests/{newId}", new
            {
                requestId = newId,
                status = request.Status,
                note = request.ValidationNote,
                previousRequests = request.PreviousRequests,
                requestFrequency = request.RequestFrequency,
            });

        })
        .RequireAuthorization();
    }
}