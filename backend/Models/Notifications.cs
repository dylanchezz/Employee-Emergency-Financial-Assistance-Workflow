namespace backend.Models;

// Mirrors one row of the notifications table (in-system notification).
public class Notification
{
    public int NotificationId { get; set; }
    public int RequestId { get; set; }
    public int RecipientId { get; set; }
    public string Channel { get; set; } = "In-System";
    public string Message { get; set; } = string.Empty;
    public bool IsRead { get; set; }
    public DateTime SentAt { get; set; }
}