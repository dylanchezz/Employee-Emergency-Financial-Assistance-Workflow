using Dapper;
using backend.Models;

namespace backend.Data;

public interface INotificationRepository
{
    Task CreateAsync(int requestId, int recipientId, string message);
    Task<IEnumerable<Notification>> GetForUserAsync(int userId);
    Task<int> CountUnreadAsync(int userId);
    Task MarkReadAsync(int notificationId, int userId);
    Task MarkAllReadAsync(int userId);
}

public class NotificationRepository : INotificationRepository
{
    private readonly IDbConnectionFactory _factory;

    public NotificationRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    // Write one in-system notification.
    public async Task CreateAsync(int requestId, int recipientId, string message)
    {
        const string sql = @"
            INSERT INTO notifications (request_id, recipient_id, channel, message)
            VALUES (@RequestId, @RecipientId, 'In-System', @Message);";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { RequestId = requestId, RecipientId = recipientId, Message = message });
    }

    // A user's own in-system notifications, newest first.
    public async Task<IEnumerable<Notification>> GetForUserAsync(int userId)
    {
        const string sql = @"
            SELECT notification_id AS NotificationId,
                   request_id      AS RequestId,
                   recipient_id    AS RecipientId,
                   channel         AS Channel,
                   message         AS Message,
                   is_read         AS IsRead,
                   sent_at         AS SentAt
            FROM notifications
            WHERE recipient_id = @UserId
              AND channel = 'In-System'
            ORDER BY sent_at DESC
            LIMIT 50;";
        using var connection = _factory.CreateConnection();
        return await connection.QueryAsync<Notification>(sql, new { UserId = userId });
    }

    public async Task<int> CountUnreadAsync(int userId)
    {
        const string sql = @"
            SELECT COUNT(*) FROM notifications
            WHERE recipient_id = @UserId AND channel = 'In-System' AND is_read = FALSE;";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteScalarAsync<int>(sql, new { UserId = userId });
    }

    // Mark one notification read — scoped to the owner so a user can't mark another's.
    public async Task MarkReadAsync(int notificationId, int userId)
    {
        const string sql = @"
            UPDATE notifications SET is_read = TRUE
            WHERE notification_id = @NotificationId AND recipient_id = @UserId;";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { NotificationId = notificationId, UserId = userId });
    }

    public async Task MarkAllReadAsync(int userId)
    {
        const string sql = @"
            UPDATE notifications SET is_read = TRUE
            WHERE recipient_id = @UserId AND is_read = FALSE;";
        using var connection = _factory.CreateConnection();
        await connection.ExecuteAsync(sql, new { UserId = userId });
    }
}