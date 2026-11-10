namespace backend.Models;

// One emailed 2FA login code (table two_factor_codes, migration 009).
public class TwoFactorCode
{
    public int CodeId { get; set; }
    public int UserId { get; set; }
    public string CodeHash { get; set; } = string.Empty;   // BCrypt hash — never the raw code
    public DateTime ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTime CreatedAt { get; set; }

    // Computed by the database (expires_at <= now()) when the row is read, so expiry is always
    // judged by ONE clock — the DB's — the same clock that set expires_at.
    public bool IsExpired { get; set; }
}
