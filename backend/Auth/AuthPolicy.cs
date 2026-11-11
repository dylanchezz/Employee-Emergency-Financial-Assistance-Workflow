namespace backend.Auth;

// Phase 7 (A1 + A4) — password sign-in protection and password-reset constants, in one place
// (same pattern as ClaimPolicy / TwoFactorPolicy / PasswordPolicy) so the demo can tune them.
public static class AuthPolicy
{
    // ---- A1: login throttling (per ACCOUNT — migration 015) ----

    // Consecutive wrong passwords allowed. The Nth wrong password locks the account.
    public const int MaxFailedLogins = 5;

    // How long the lock lasts. While locked, password sign-in returns 429 even with the right
    // password — and the 2FA step is never reached, so 2FA can't be used to get round it.
    public static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    // ---- A4: forgot / reset password (migration 016) ----

    // How long an emailed reset link stays usable.
    public static readonly TimeSpan ResetTokenLifetime = TimeSpan.FromMinutes(30);

    // Minimum gap between reset emails for one account (stops "forgot password" being used to
    // flood someone's inbox). Inside the gap the endpoint still says 200 — it just sends nothing.
    public static readonly TimeSpan ResetResendCooldown = TimeSpan.FromSeconds(60);

    // Random bytes in a reset token (256 bits). High entropy is what makes a fast SHA-256 hash safe.
    public const int ResetTokenBytes = 32;

    // ONE message for every locked response — a real locked account and an unknown email that has
    // been "locked" (see LoginThrottle) read exactly the same, so the lock never reveals existence.
    public static string LockedMessage(DateTimeOffset lockedUntil)
    {
        var minutes = Math.Max(1, (int)Math.Ceiling((lockedUntil - DateTimeOffset.UtcNow).TotalMinutes));
        return $"Too many failed sign-in attempts. Please try again in {minutes} minute{(minutes == 1 ? "" : "s")}.";
    }

    // The 429 response itself (Retry-After header + a machine-readable lockedUntil the page can show
    // in the viewer's own clock as "try again at HH:MM").
    public static IResult Locked(HttpContext http, DateTimeOffset lockedUntil)
    {
        var seconds = Math.Max(1, (int)Math.Ceiling((lockedUntil - DateTimeOffset.UtcNow).TotalSeconds));
        http.Response.Headers.RetryAfter = seconds.ToString();
        return Results.Json(
            new { error = LockedMessage(lockedUntil), lockedUntil = lockedUntil.UtcDateTime },
            statusCode: StatusCodes.Status429TooManyRequests);
    }
}
