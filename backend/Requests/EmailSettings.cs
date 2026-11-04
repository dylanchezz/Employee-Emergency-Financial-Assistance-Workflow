namespace backend.Requests;

// Binds the "Email" section of configuration (real values live in the gitignored
// appsettings.Development.json; appsettings.Example.json documents the shape).
public class EmailSettings
{
    public string SmtpHost { get; set; } = string.Empty;
    public int SmtpPort { get; set; } = 587;
    public string SmtpUser { get; set; } = string.Empty;
    public string SmtpKey { get; set; } = string.Empty;
    public string FromName { get; set; } = "Employee Welfare System";
    public string FromAddress { get; set; } = string.Empty;
    public bool Enabled { get; set; } = false;
}