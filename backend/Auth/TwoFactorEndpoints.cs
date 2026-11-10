using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using backend.Data;
using backend.Requests;
using Microsoft.Extensions.Options;

namespace backend.Auth;

// A2 Email 2FA endpoints (design locked in Impact Log A25).
//
//  Step-2 of login (pre-auth token ONLY — the "PreAuth" scheme/policy, see Program.cs):
//    POST /api/auth/verify-2fa   { code }  → the real app JWT on a correct code
//    POST /api/auth/resend-2fa             → a new code (old one stops working)
//
//  Account settings (the normal app JWT — the default "Bearer" scheme):
//    GET  /api/auth/2fa                    → { enabled }
//    POST /api/auth/2fa/enable
//    POST /api/auth/2fa/disable
public static class TwoFactorEndpoints
{
    public static void MapTwoFactorEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapPost("/verify-2fa", async (
            VerifyTwoFactorRequest request,
            ClaimsPrincipal principal,
            IUserRepository users,
            ITwoFactorCodeRepository codes,
            ITokenService tokenService) =>
        {
            var userId = CallerId(principal);

            // C2: the account may have been deactivated AFTER the password step issued this
            // pre-auth token (it lives up to 10 minutes). Refuse before any code handling — no
            // more guesses, and the pending code is thrown away.
            var account = await users.GetByIdAsync(userId);
            if (account is null || !account.IsActive)
            {
                await codes.DeleteAllForUserAsync(userId);
                return Results.Json(new { error = "This account has been deactivated." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            // Shape check first. A malformed entry isn't a real guess, so it doesn't use an attempt.
            var entered = request.Code?.Trim() ?? string.Empty;
            if (entered.Length != TwoFactorPolicy.CodeLength || !entered.All(char.IsAsciiDigit))
            {
                return Results.BadRequest(new { error = $"Enter the {TwoFactorPolicy.CodeLength}-digit code from your email." });
            }

            var code = await codes.GetLatestAsync(userId);
            if (code is null)
            {
                // Consumed, locked out, or never issued → only a fresh password login helps.
                return StartOver("This sign-in attempt is no longer valid. Please sign in again.");
            }
            if (code.IsExpired)
            {
                // 410 Gone: the code existed but has lapsed — the user can press "resend".
                return Results.Json(
                    new { error = "This code has expired. Request a new code.", expired = true },
                    statusCode: StatusCodes.Status410Gone);
            }

            // Count the guess BEFORE comparing, atomically (conditional UPDATE). Null means the
            // code is already at the limit — e.g. a parallel request used the last attempt.
            var attempts = await codes.TryRecordAttemptAsync(code.CodeId, TwoFactorPolicy.MaxWrongAttempts);
            if (attempts is null)
            {
                await codes.DeleteAllForUserAsync(userId);
                return StartOver("Too many incorrect codes. Please sign in again.");
            }

            if (BCrypt.Net.BCrypt.Verify(entered, code.CodeHash))
            {
                // Only the request that actually deletes the code may mint a token (one code → one JWT).
                if (!await codes.ConsumeAsync(userId, code.CodeId))
                {
                    return StartOver("This code has already been used. Please sign in again.");
                }

                var user = await users.GetByIdAsync(userId);
                if (user is null)
                {
                    return StartOver("This account no longer exists.");
                }
                // C2, at the exact mint point too (deactivated in the milliseconds since the check above).
                if (!user.IsActive)
                {
                    return Results.Json(new { error = "This account has been deactivated." },
                        statusCode: StatusCodes.Status403Forbidden);
                }

                // The SAME real app JWT a one-step login gets — nothing downstream changes.
                var token = tokenService.CreateToken(user);
                return Results.Ok(new AuthResponse(user.UserId, user.Name, user.Email, user.Role, token));
            }

            // Wrong code.
            var remaining = TwoFactorPolicy.MaxWrongAttempts - attempts.Value;
            if (remaining <= 0)
            {
                // 5th wrong guess: destroy the code and bounce to the password step. This is
                // NOT an account lock (that's A1) — the password still works.
                await codes.DeleteAllForUserAsync(userId);
                return StartOver("Too many incorrect codes. Please sign in again.");
            }
            return Results.BadRequest(new
            {
                error = $"That code is incorrect. {remaining} attempt{(remaining == 1 ? "" : "s")} left.",
                attemptsRemaining = remaining,
            });
        })
        .RequireAuthorization(TwoFactorPolicy.PreAuthPolicy);

        group.MapPost("/resend-2fa", async (
            ClaimsPrincipal principal,
            IUserRepository users,
            ITwoFactorCodeRepository codes,
            IEmailService email) =>
        {
            var userId = CallerId(principal);

            // C2: a deactivated account gets no more codes emailed.
            var account = await users.GetByIdAsync(userId);
            if (account is null || !account.IsActive)
            {
                await codes.DeleteAllForUserAsync(userId);
                return Results.Json(new { error = "This account has been deactivated." },
                    statusCode: StatusCodes.Status403Forbidden);
            }

            var (count, secondsSinceLatest) = await codes.GetIssueStatsAsync(userId);
            if (count == 0)
            {
                return StartOver("This sign-in attempt is no longer valid. Please sign in again.");
            }

            // Rows in this login attempt = 1 (sent at login) + resends so far.
            if (count > TwoFactorPolicy.MaxResends)
            {
                return Results.Json(
                    new { error = "You've reached the resend limit. Please sign in again to get a new code." },
                    statusCode: StatusCodes.Status429TooManyRequests);
            }

            var cooldown = TwoFactorPolicy.ResendCooldown.TotalSeconds;
            if (secondsSinceLatest < cooldown)
            {
                var wait = (int)Math.Ceiling(cooldown - secondsSinceLatest);
                return Results.Json(
                    new { error = $"Please wait {wait} seconds before requesting another code.", retryAfterSeconds = wait },
                    statusCode: StatusCodes.Status429TooManyRequests);
            }

            var user = await users.GetByIdAsync(userId);
            if (user is null)
            {
                return StartOver("This account no longer exists.");
            }

            var sent = await TwoFactorCodeSender.IssueAndSendAsync(user, freshLoginAttempt: false, codes, email);
            if (!sent)
            {
                // The new row stays (it counts towards the cap, so a failing mail server can't
                // be used to bypass the cooldown) but it was never delivered.
                return Results.Json(
                    new { error = "We couldn't send a new code. Please try again shortly." },
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }

            return Results.Ok(new
            {
                message = "A new code has been sent. Earlier codes no longer work.",
                resendCooldownSeconds = (int)cooldown,
                resendsLeft = TwoFactorPolicy.MaxResends - count,
            });
        })
        .RequireAuthorization(TwoFactorPolicy.PreAuthPolicy);

        // ---- Enrolment (real app JWT; the default policy/scheme) ----

        group.MapGet("/2fa", async (ClaimsPrincipal principal, IUserRepository users) =>
        {
            var user = await users.GetByIdAsync(CallerId(principal));
            // available=false for a Google-only account (A3): email 2FA guards PASSWORD logins
            // only, so the frontend hides the toggle rather than offer a setting with no effect.
            return user is null
                ? Results.NotFound(new { error = "Account not found." })
                : Results.Ok(new { enabled = user.TwoFactorEnabled, available = user.PasswordHash is not null });
        })
        .RequireAuthorization();

        group.MapPost("/2fa/enable", async (
            ClaimsPrincipal principal,
            IUserRepository users,
            IOptions<EmailSettings> emailSettings,
            IEmailService email,
            ILoggerFactory loggerFactory) =>
        {
            // Guard: with email switched off on this server, an enrolled user could never
            // receive a code and would be locked out of their own account. Refuse up front.
            if (!emailSettings.Value.Enabled)
            {
                return Results.BadRequest(new { error = "Two-step sign-in needs email, which is not enabled on this server." });
            }

            var userId = CallerId(principal);

            // A3 (A25): a Google-only account signs in through Google, which does its own MFA;
            // our email code would never be asked for, so refuse rather than store a dead setting.
            var account = await users.GetByIdAsync(userId);
            if (account is null)
            {
                return Results.NotFound(new { error = "Account not found." });
            }
            if (account.PasswordHash is null)
            {
                return Results.BadRequest(new { error = "This account signs in with Google, which provides its own two-step verification." });
            }

            if (!await users.SetTwoFactorEnabledAsync(userId, true))
            {
                return Results.NotFound(new { error = "Account not found." });
            }

            // Audit decision (A25 open question, option a): audit_logs is request-scoped
            // (request_id NOT NULL → welfare_requests), and enrolment is an ACCOUNT event, so it
            // is application-logged only. A dedicated account-security audit trail is future work.
            var logger = loggerFactory.CreateLogger("Auth.TwoFactor");
            logger.LogInformation("2FA ENABLED by user {UserId} at {Utc:o}.", userId, DateTime.UtcNow);

            var noticeEmailSent = await SendSecurityNoticeAsync(userId, enabled: true, users, email, logger);
            return Results.Ok(new { enabled = true, noticeEmailSent });
        })
        .RequireAuthorization();

        group.MapPost("/2fa/disable", async (
            ClaimsPrincipal principal,
            IUserRepository users,
            ITwoFactorCodeRepository codes,
            IEmailService email,
            ILoggerFactory loggerFactory) =>
        {
            var userId = CallerId(principal);
            if (!await users.SetTwoFactorEnabledAsync(userId, false))
            {
                return Results.NotFound(new { error = "Account not found." });
            }
            // Tidy: no codes should outlive the opt-out.
            await codes.DeleteAllForUserAsync(userId);

            // Same audit decision as enable (app-log only; account-security audit = future work).
            var logger = loggerFactory.CreateLogger("Auth.TwoFactor");
            logger.LogInformation("2FA DISABLED by user {UserId} at {Utc:o}.", userId, DateTime.UtcNow);

            var noticeEmailSent = await SendSecurityNoticeAsync(userId, enabled: false, users, email, logger);
            return Results.Ok(new { enabled = false, noticeEmailSent });
        })
        .RequireAuthorization();
    }

    // Security notice emailed after 2FA is turned on or off. The point is to reach the REAL
    // account owner if someone else made the change (e.g. on a stolen session) — an in-app
    // notice would only be seen by whoever is already signed in.
    //
    // Best-effort, like other notification emails (A21): the setting has already changed, so a
    // mail failure must not undo it or fail the request. Email only — notifications.request_id
    // is NOT NULL (request-scoped), so an account event can't be stored there (same limitation
    // as audit_logs); the send result is app-logged instead.
    private static async Task<bool> SendSecurityNoticeAsync(
        int userId, bool enabled, IUserRepository users, IEmailService email, ILogger logger)
    {
        var user = await users.GetByIdAsync(userId);
        if (user is null || string.IsNullOrWhiteSpace(user.Email))
        {
            return false;
        }

        var state = enabled ? "turned ON" : "turned OFF";
        var effect = enabled
            ? "From now on, signing in will also need a 6-digit code sent to this email address."
            : "Signing in now needs only your password.";
        var body =
            $"Hello {user.Name},\n\n" +
            $"Two-step sign-in was {state} for your Welfare Assistance account at " +
            $"{DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC.\n\n" +
            $"{effect}\n\n" +
            "If you did not make this change, change your password immediately and contact your administrator.";

        var sent = await email.SendAsync(user.Email, $"Security notice: two-step sign-in {state}", body);
        logger.LogInformation("2FA {State} security notice to user {UserId}: {Result}.",
            enabled ? "enabled" : "disabled", userId, sent ? "sent" : "NOT sent");
        return sent;
    }

    // The caller's user id from the "sub" claim (works for both the pre-auth and the real token).
    private static int CallerId(ClaimsPrincipal principal)
    {
        var raw = principal.FindFirstValue(JwtRegisteredClaimNames.Sub)
            ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(raw, out var id) ? id : 0;
    }

    // 401 + startOver flag: the frontend sends the user back to the password step.
    private static IResult StartOver(string message) =>
        Results.Json(new { error = message, startOver = true }, statusCode: StatusCodes.Status401Unauthorized);
}
