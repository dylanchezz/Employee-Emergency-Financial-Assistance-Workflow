using System.Diagnostics.Contracts;

namespace backend.Models;

public class User
{
    public int UserId {get; set; }
    public string Name {get; set; } = string.Empty;
    public string Email {get; set; } = string.Empty;
    public string PasswordHash {get; set; } = string.Empty;
    public string Role {get; set; } = string.Empty;
    public string? Department {get; set; }
    public DateTime CreatedAt {get; set; }

}