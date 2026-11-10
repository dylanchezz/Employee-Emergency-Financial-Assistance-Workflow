namespace backend.Auth;

// Email 2FA (A2) policy constants, in one place so they're easy to change and to defend
// (same pattern as ClaimPolicy / EscalationPolicy). Values locked in Impact Log A25.
public static class TwoFactorPolicy
{
    // A 6-digit numeric one-time code (000000–999999).
    public const int CodeLength = 6;

    // How long an emailed code stays valid.
    public static readonly TimeSpan CodeLifetime = TimeSpan.FromMinutes(10);

    // Wrong guesses allowed on one code. On the 5th wrong guess the code is destroyed and the
    // user must start again from the password step (NOT an account lock — that is A1).
    public const int MaxWrongAttempts = 5;

    // Minimum gap between "resend code" requests.
    public static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(60);

    // Resends allowed per login attempt (on top of the code sent at login).
    public const int MaxResends = 3;

    // The pre-auth token: the short-lived JWT issued after a correct password, which can ONLY
    // be used on /verify-2fa and /resend-2fa. Its distinct audience is what keeps it from
    // being accepted anywhere else (the normal "Bearer" scheme expects the app audience).
    public static readonly TimeSpan PreAuthTokenLifetime = TimeSpan.FromMinutes(10);
    public const string PreAuthAudience = "verify-2fa";
    public const string PendingClaim = "twofa_pending";

    // Names used to wire the second bearer scheme + its policy in Program.cs.
    public const string PreAuthScheme = "PreAuth";
    public const string PreAuthPolicy = "TwoFactorPending";
}
