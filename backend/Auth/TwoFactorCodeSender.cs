using System.Security.Cryptography;
using backend.Data;
using backend.Models;
using backend.Requests;

namespace backend.Auth;

// A2 Email 2FA: creates a one-time code, stores ONLY its hash, and emails the raw code.
// Shared by POST /login (fresh code) and POST /resend-2fa (replacement code) so both paths
// generate, hash and word the email identically.
public static class TwoFactorCodeSender
{
    // Returns true if the email went out. On false, the caller must fail the step — unlike
    // notifications (best-effort), the 2FA email is a HARD dependency: no email, no login.
    public static async Task<bool> IssueAndSendAsync(
        User user,
        bool freshLoginAttempt,
        ITwoFactorCodeRepository codes,
        IEmailService email)
    {
        // Cryptographically secure RNG (not System.Random, which is predictable).
        // GetInt32's upper bound is exclusive → 0..999999, zero-padded to 6 digits.
        var max = (int)Math.Pow(10, TwoFactorPolicy.CodeLength);
        var code = RandomNumberGenerator.GetInt32(0, max).ToString($"D{TwoFactorPolicy.CodeLength}");

        // Hash like a password (A25: the code is a credential). The raw code exists only in
        // memory here and in the email — never in the database or the logs.
        var codeHash = BCrypt.Net.BCrypt.HashPassword(code);

        if (freshLoginAttempt)
        {
            await codes.IssueFreshAsync(user.UserId, codeHash, TwoFactorPolicy.CodeLifetime);
        }
        else
        {
            await codes.ReplaceActiveAsync(user.UserId, codeHash, TwoFactorPolicy.CodeLifetime);
        }

        var minutes = (int)TwoFactorPolicy.CodeLifetime.TotalMinutes;
        var body =
            $"Hello {user.Name},\n\n" +
            $"Your sign-in code is: {code}\n\n" +
            $"It expires in {minutes} minutes. If you did not just try to sign in, " +
            "someone may know your password — please change it and tell your administrator.";

        return await email.SendAsync(user.Email, "Your sign-in code", body);
    }

    // "employee@test.com" → "e*******@test.com" — enough for the user to recognise the inbox
    // on the verify screen without echoing the full address.
    public static string MaskEmail(string address)
    {
        var at = address.IndexOf('@');
        if (at <= 1)
        {
            return address;
        }
        return address[0] + new string('*', at - 1) + address[at..];
    }
}
