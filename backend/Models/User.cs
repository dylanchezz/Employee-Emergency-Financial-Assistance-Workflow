using System.Diagnostics.Contracts;

namespace backend.Models;

public class User
{
    public int UserId {get; set; }
    public string Name {get; set; } = string.Empty;
    public string Email {get; set; } = string.Empty;
    // NULL for a Google-only account (A3, migration 010) — it has no password of ours.
    public string? PasswordHash {get; set; }
    public string Role {get; set; } = string.Empty;
    // D1 (migration 011): required, FK to departments(name). "Unassigned" until chosen.
    public string Department {get; set; } = "Unassigned";
    public DateTime CreatedAt {get; set; }
    // A2 Email 2FA opt-in (migration 009). False = one-step login, exactly as before.
    public bool TwoFactorEnabled {get; set; }
    // A3 external identity, e.g. ("google", Google's stable `sub`). Both null for password accounts.
    public string? OAuthProvider {get; set; }
    public string? OAuthSubject {get; set; }

}