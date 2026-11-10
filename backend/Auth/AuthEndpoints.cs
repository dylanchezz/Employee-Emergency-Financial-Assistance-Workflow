using System.Net;
using backend.Data;
using backend.Models;
using backend.Requests;

namespace backend.Auth;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth");

        //Signup that always creates an employee
        group.MapPost("/signup", async (
            SignupRequest request,
            IUserRepository users) =>
        {
            //Basic Input Validation
            if (string.IsNullOrWhiteSpace(request.Name) || 
                string.IsNullOrWhiteSpace(request.Email) ||
                string.IsNullOrWhiteSpace(request.Password))
            {
                return Results.BadRequest(new {error = "Name, email, and password are required"});
            }
            //Reject duplicate emails
            var existing = await users.GetByEmailAsync(request.Email);
            if (existing is not null)
            {
                return Results.Conflict(new { error = "An account with this email already exists"});
            }

            //Hash the password
            var passwordHash = BCrypt.Net.BCrypt.HashPassword(request.Password);
            
            var user = new User
            {
                Name = request.Name,
                Email = request.Email,
                PasswordHash = passwordHash,
                Role = "Employee",
                Department = request.Department
            };

            var newId = await users.CreateAsync(user);

            return Results.Created($"/api/users/{newId}",
                new { userId = newId, email = user.Email, role = user.Role});
        });

        group.MapPost("/login", async (
            LoginRequest request,
            IUserRepository users,
            ITokenService tokenService,
            ITwoFactorCodeRepository codes,
            IEmailService email
        ) =>
        {
            var user = await users.GetByEmailAsync(request.Email);

            // A3 (A25): a Google-only account has no password. Say so plainly rather than
            // "incorrect password" — and this guard must come BEFORE BCrypt.Verify, which
            // throws on a null hash (that would surface as a 500).
            if (user is not null && user.PasswordHash is null)
            {
                return Results.Json(
                    new { error = "This account uses Google sign-in. Please use \"Continue with Google\"." },
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            //Same response whether the email is unknown or the password is wrong.
            //An attacker cannot tell which emails are registered
            if (user is null ||
                !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
            {
                return Results.Unauthorized();
            }

            // A2 Email 2FA: an enrolled user gets a code by email and a pre-auth token —
            // NOT the real JWT. The real token is only minted by /verify-2fa after a correct code.
            if (user.TwoFactorEnabled)
            {
                var sent = await TwoFactorCodeSender.IssueAndSendAsync(
                    user, freshLoginAttempt: true, codes, email);
                if (!sent)
                {
                    // No email → the user could never finish, so don't leave a dead code behind.
                    await codes.DeleteAllForUserAsync(user.UserId);
                    return Results.Json(
                        new { error = "We couldn't send your sign-in code by email. Please try again later or contact your administrator." },
                        statusCode: StatusCodes.Status503ServiceUnavailable);
                }

                return Results.Ok(new TwoFactorChallengeResponse(
                    TwoFactorRequired: true,
                    PreAuthToken: tokenService.CreatePreAuthToken(user),
                    MaskedEmail: TwoFactorCodeSender.MaskEmail(user.Email),
                    ResendCooldownSeconds: (int)TwoFactorPolicy.ResendCooldown.TotalSeconds));
            }

            // Not enrolled: one-step login, exactly as before A2.
            var token = tokenService.CreateToken(user);

            return Results.Ok(new AuthResponse(
                user.UserId, user.Name, user.Email, user.Role, token));
        });

        //Logout. Client discards the token
        group.MapPost("/logout", () =>
        {
            return Results.Ok(new { message = "Logged Out. Please discard your token"});
        });
    }
}
