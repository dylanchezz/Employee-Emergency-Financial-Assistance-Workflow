using System.Security.Cryptography;
using System.Text;
using backend.Data;
using backend.Requests;

namespace backend.Auth;

// Phase 7 (A4) — "forgot password": an emailed, single-use reset LINK.
//
//   POST /api/auth/forgot-password { email }          → ALWAYS 200 with the same message
//   POST /api/auth/reset-password  { token, newPassword } → 200, or 400 "invalid or expired link"
//
// The token is 32 random bytes (base64url in the link). Only its SHA-256 hash is stored, so a
// database leak does not hand out working links. Reset also clears the A1 lock and sends a
// security-notice email (the A2 enable/disable-notice pattern). Account events are app-logged, not
// written to audit_logs/notifications (both are request-scoped — request_id NOT NULL).
public static class PasswordResetEndpoints
{
    // One answer for every email — registered or not, password or Google, active or not.
    private const string ForgotMessage =
        "If an account with a password exists for that email, we've sent a link to reset it. " +
        "The link works once and expires in 30 minutes.";

    private const string BadLinkMessage =
        "This reset link is invalid, has already been used, or has expired. Please request a new one.";

    public static void MapPasswordResetEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapPost("/forgot-password", async (
            ForgotPasswordRequest request,
            IUserRepository users,
            IPasswordResetRepository resets,
            IEmailService email,
            IConfiguration config,
            ILoggerFactory loggerFactory) =>
        {
            var logger = loggerFactory.CreateLogger("PasswordReset");
            var address = request.Email?.Trim() ?? string.Empty;
            var user = address.Length == 0 ? null : await users.GetByEmailAsync(address);

            // Every "no" below still returns the SAME 200 — the response never says which case it was.
            if (user is null || user.PasswordHash is null || !user.IsActive)
            {
                // Unknown email, Google-only account (no password to reset — it signs in with Google),
                // or a deactivated account: send nothing.
                logger.LogInformation("Forgot-password: no eligible account for the given email; nothing sent.");
                return Results.Ok(new { message = ForgotMessage });
            }

            // Cooldown: don't let "forgot password" flood someone's inbox. Still 200.
            var since = await resets.SecondsSinceLatestAsync(user.UserId);
            if (since is { } s && s < AuthPolicy.ResetResendCooldown.TotalSeconds)
            {
                logger.LogInformation("Forgot-password for user {UserId}: inside cooldown; nothing sent.", user.UserId);
                return Results.Ok(new { message = ForgotMessage });
            }

            var token = NewToken();
            await resets.IssueAsync(user.UserId, HashToken(token), AuthPolicy.ResetTokenLifetime);

            var baseUrl = (config["FrontendBaseUrl"] ?? "http://localhost:3000").TrimEnd('/');
            var link = $"{baseUrl}/reset-password?token={token}";
            var minutes = (int)AuthPolicy.ResetTokenLifetime.TotalMinutes;
            var body =
                $"Hello {user.Name},\n\n" +
                "We received a request to reset the password for your Employee Welfare Portal account.\n\n" +
                $"Open this link to choose a new password (it works once and expires in {minutes} minutes):\n" +
                $"{link}\n\n" +
                "If you didn't ask for this, you can ignore this email — your password will not change.";

            var sent = await email.SendAsync(user.Email, "Reset your password", body);
            logger.LogInformation("Forgot-password for user {UserId}: reset link {Result}.",
                user.UserId, sent ? "sent" : "NOT sent");
            return Results.Ok(new { message = ForgotMessage });
        });

        group.MapPost("/reset-password", async (
            ResetPasswordRequest request,
            IUserRepository users,
            IPasswordResetRepository resets,
            IEmailService email,
            ILoggerFactory loggerFactory) =>
        {
            var logger = loggerFactory.CreateLogger("PasswordReset");

            if (string.IsNullOrWhiteSpace(request.Token))
            {
                return Results.BadRequest(new { error = BadLinkMessage });
            }
            // Check the password rule FIRST, so a too-short password doesn't burn the link.
            if (PasswordPolicy.Problem(request.NewPassword) is { } problem)
            {
                return Results.BadRequest(new { error = problem });
            }

            var newHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            var userId = await resets.ConsumeAndSetPasswordAsync(HashToken(request.Token.Trim()), newHash);
            if (userId is null)
            {
                return Results.BadRequest(new { error = BadLinkMessage });
            }

            logger.LogInformation("Password reset completed for user {UserId}; login lock cleared.", userId);

            // Security notice (best-effort): if the owner didn't do this, they find out by email.
            var user = await users.GetByIdAsync(userId.Value);
            if (user is not null && !string.IsNullOrWhiteSpace(user.Email))
            {
                var body =
                    $"Hello {user.Name},\n\n" +
                    "The password for your Employee Welfare Portal account was reset using a password-reset link " +
                    $"at {DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC.\n\n" +
                    "If you did not do this, contact your administrator immediately.";
                var sent = await email.SendAsync(user.Email, "Security notice: your password was reset", body);
                logger.LogInformation("Password-reset security notice to user {UserId}: {Result}.",
                    userId, sent ? "sent" : "NOT sent");
            }

            return Results.Ok(new { message = "Your password has been reset. You can now sign in." });
        });
    }

    // 256 random bits, base64url (no + / = — safe in a URL without escaping).
    private static string NewToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(AuthPolicy.ResetTokenBytes);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    // Lower-case hex SHA-256 — 64 chars, matching password_reset_tokens.token_hash CHAR(64).
    internal static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();
}

public record ForgotPasswordRequest(string? Email);
public record ResetPasswordRequest(string? Token, string? NewPassword);
