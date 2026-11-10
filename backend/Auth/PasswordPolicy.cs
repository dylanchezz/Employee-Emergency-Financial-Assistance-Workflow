namespace backend.Auth;

// Phase 3 (A6): ONE password rule for every place a password is SET — signup, admin create-user,
// change-password — in the same style as ClaimPolicy / TwoFactorPolicy. (Before this, signup and
// create-user only required "not empty"; change-password introduced the rule, so all three share it.)
// Existing passwords are untouched — the rule applies when a password is set, not at login.
public static class PasswordPolicy
{
    public const int MinLength = 8;

    // Null when acceptable, otherwise the message to show.
    public static string? Problem(string? password) =>
        string.IsNullOrEmpty(password) || password.Length < MinLength
            ? $"Password must be at least {MinLength} characters."
            : null;
}
