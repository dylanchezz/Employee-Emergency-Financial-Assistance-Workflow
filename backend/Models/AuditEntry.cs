namespace backend.Models;

public class AuditEntry
{
    public int LogId { get; set; }
    public int RequestId { get; set; }
    public int? ActorId { get; set; }
    public string? ActorName { get; set; }
    public string Action { get; set; } = string.Empty;
    public DateTime LoggedAt { get; set; }
}