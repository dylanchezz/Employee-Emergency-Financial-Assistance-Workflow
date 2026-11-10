using Dapper;
using backend.Models;

namespace backend.Data;

public interface INotificationRepository
{
    Task CreateAsync(int requestId, int recipientId, string message);
    Task CreateEmailAsync(int requestId, int recipientId, string message);
    Task<IEnumerable<Notification>> GetForUserAsync(int userId);
    Task<int> CountUnreadAsync(int userId);
    Task MarkReadAsync(int notificationId, int userId);
    Task MarkAllReadAsync(int userId);
    Task<int> ClearAllAsync(int userId);   // Phase 3 (C6)
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
    // Record that an email notification was sent (channel 'Email'), so the email send is
    // itself auditable alongside the in-system rows.
    public async Task CreateEmailAsync(int requestId, int recipientId, string message)
    {
        const string sql = @"
            INSERT INTO notifications (request_id, recipient_id, channel, message)
            VALUES (@RequestId, @RecipientId, 'Email', @Message);";
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

    // Phase 3 (C6) "Clear all": delete the caller's OWN in-system notifications. Recipient-scoped
    // (WHERE recipient_id = caller), so nobody can clear anyone else's. Notifications are transient
    // inbox items — the permanent record is audit_logs, which this never touches. 'Email'-channel
    // rows are kept: they are the record that an email was actually sent (A21), not inbox items.
    public async Task<int> ClearAllAsync(int userId)
    {
        const string sql = @"
            DELETE FROM notifications
            WHERE recipient_id = @UserId AND channel = 'In-System';";
        using var connection = _factory.CreateConnection();
        return await connection.ExecuteAsync(sql, new { UserId = userId });
    }
}