using backend.Data;
using Microsoft.Extensions.Options;
using Npgsql;

namespace backend.Auth;

// A3 Google sign-in (design locked in Impact Log A25), GIS popup authorization-code flow:
//   browser ──popup──▶ Google ──code──▶ browser ──POST /api/auth/google {code}──▶ backend
//   backend ──code + secret──▶ Google ──ID token──▶ backend validates ──▶ OUR app JWT
// One token type everywhere: a Google user ends up with the same JWT as a password user.
public static class GoogleAuthEndpoints
{
    private const string Provider = "google";

    public static void MapGoogleAuthEndpoints(this WebApplication app)
    {
        app.MapPost("/api/auth/google", async (
            GoogleSignInRequest request,
            HttpRequest http,
            IOptions<GoogleAuthSettings> settings,
            IGoogleAuthService google,
            IUserRepository users,
            ITokenService tokenService,
            ILoggerFactory loggerFactory) =>
        {
            var logger = loggerFactory.CreateLogger("Auth.Google");

            if (!settings.Value.IsConfigured)
            {
                return Results.Json(new { error = "Google sign-in is not configured on this server." },
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            // CSRF guard recommended by Google for the popup code flow: require a custom header.
            // A plain cross-site form post can't add one, and a script adding one triggers a CORS
            // preflight, which our CORS policy only allows from the frontend origin.
            if (!string.Equals(http.Headers["X-Requested-With"], "XmlHttpRequest", StringComparison.Ordinal))
            {
                return Results.BadRequest(new { error = "Missing X-Requested-With header." });
            }

            if (string.IsNullOrWhiteSpace(request.Code))
            {
                return Results.BadRequest(new { error = "Missing authorization code." });
            }

            var identity = await google.ExchangeCodeAsync(request.Code);
            if (identity is null)
            {
                return Results.Json(new { error = "Google sign-in failed. Please try again." },
                    statusCode: StatusCodes.Status401Unauthorized);
            }

            // Only trust an email Google has verified — otherwise someone could create a Google
            // account claiming another person's address.
            if (!identity.EmailVerified)
            {
                return Results.Json(new { error = "Your Google email address is not verified." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            // 1. Returning Google user: match on the stable `sub`, never on email.
            var user = await users.GetByOAuthAsync(Provider, identity.Subject);

            if (user is null)
            {
                // 2. Email collision → BLOCK, don't auto-link (A25: zero account-takeover surface).
                if (await users.EmailExistsAsync(identity.Email))
                {
                    // (Address deliberately not logged — keep personal data out of app logs.)
                    logger.LogInformation("Google sign-in blocked: email already registered to an existing account.");
                    return Results.Conflict(new
                    {
                        error = "An account with this email already exists — please sign in with your password.",
                    });
                }

                // 3. First-time Google user → least-privileged Employee, department null (A25).
                var name = string.IsNullOrWhiteSpace(identity.Name)
                    ? identity.Email.Split('@')[0]
                    : identity.Name;
                try
                {
                    var newId = await users.CreateOAuthUserAsync(name, identity.Email, Provider, identity.Subject);
                    logger.LogInformation("Google sign-in created user {UserId}.", newId);
                }
                catch (PostgresException ex) when (ex.SqlState == PostgresErrorCodes.UniqueViolation)
                {
                    // Lost a race: a parallel first sign-in for the same Google account (or the same
                    // email) inserted first. The re-read below decides which case it was.
                    logger.LogInformation("Google sign-in insert raced ({Constraint}); re-reading.", ex.ConstraintName);
                }

                user = await users.GetByOAuthAsync(Provider, identity.Subject);
                if (user is null)
                {
                    // The unique violation was the email, not our identity → same answer as step 2.
                    return Results.Conflict(new
                    {
                        error = "An account with this email already exists — please sign in with your password.",
                    });
                }
            }

            // No email 2FA step here (A25): Google already authenticated the person (and applies
            // its own MFA), so the A2 two-step login is for password logins only.
            var token = tokenService.CreateToken(user);
            return Results.Ok(new AuthResponse(user.UserId, user.Name, user.Email, user.Role, token));
        });
    }
}
