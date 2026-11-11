using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Options;
using MimeKit;

namespace backend.Requests;

public interface IEmailService
{
    // Sends an email. Best-effort: returns false on failure (logged) instead of throwing,
    // so a mail problem never breaks the request flow or the in-system notification.
    Task<bool> SendAsync(string toAddress, string subject, string body);
}

public class EmailService : IEmailService
{
    private readonly EmailSettings _settings;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IOptions<EmailSettings> settings, ILogger<EmailService> logger)
    {
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task<bool> SendAsync(string toAddress, string subject, string body)
    {
        // Email can be turned off entirely via config (Enabled=false) — e.g. a fresh clone
        // with no real credentials. Then we just skip, quietly.
        if (!_settings.Enabled)
        {
            _logger.LogInformation("Email disabled (Email:Enabled=false); skipped '{Subject}' to {To}.",
                subject, toAddress);
            return false;
        }

        try
        {
            var message = new MimeMessage();
            message.From.Add(new MailboxAddress(_settings.FromName, _settings.FromAddress));
            message.To.Add(MailboxAddress.Parse(toAddress));
            message.Subject = subject;
            // Phase 7 (G3): multipart/alternative — the original plain text PLUS a branded HTML
            // version of the same text (EmailTemplate encodes it safely). Callers are unchanged.
            message.Body = new BodyBuilder
            {
                TextBody = body,
                HtmlBody = EmailTemplate.Render(subject, body),
            }.ToMessageBody();

            using var client = new SmtpClient();
            // Brevo on port 587 uses STARTTLS (upgrade a plain connection to TLS).
            await client.ConnectAsync(_settings.SmtpHost, _settings.SmtpPort, SecureSocketOptions.StartTls);
            await client.AuthenticateAsync(_settings.SmtpUser, _settings.SmtpKey);
            await client.SendAsync(message);
            await client.DisconnectAsync(quit: true);

            _logger.LogInformation("Email sent: '{Subject}' to {To}.", subject, toAddress);
            return true;
        }
        catch (Exception ex)
        {
            // Swallow — a failed email must not break the workflow. The in-system notification
            // still stands; we just log the SMTP failure.
            _logger.LogError(ex, "Failed to send email '{Subject}' to {To}.", subject, toAddress);
            return false;
        }
    }
}