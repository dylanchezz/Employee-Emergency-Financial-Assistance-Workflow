using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace backend.Requests;

// Phase 7 (G3) — one branded HTML layout for EVERY email the app sends.
//
// Callers still write plain text (unchanged — no caller was touched). EmailService sends that text
// as the text/plain part AND wraps it here as the text/html part (multipart/alternative), so mail
// apps that show HTML get the branded version and the rest get the original text.
//
// Safety: the text is HTML-ENCODED first (names, reasons and notes come from users — no injected
// markup can survive); only then are blank lines turned into paragraphs, line breaks into <br>, and
// http(s) links into <a>. Inline styles + a table layout, because email clients ignore <style>/CSS files.
public static partial class EmailTemplate
{
    private const string BrandName = "Employee Welfare Portal";
    private const string BrandRed = "#c8102e";

    [GeneratedRegex(@"https?://[^\s<]+", RegexOptions.IgnoreCase)]
    private static partial Regex UrlPattern();

    public static string Render(string subject, string plainBody)
    {
        var paragraphs = plainBody
            .Replace("\r\n", "\n")
            .Split("\n\n", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        var html = new StringBuilder();
        foreach (var p in paragraphs)
        {
            var encoded = WebUtility.HtmlEncode(p);
            // Link-ify AFTER encoding: the URL text is already safe, and inside href="" the encoded
            // form (&amp;) is exactly what HTML expects.
            encoded = UrlPattern().Replace(encoded, m =>
                $"<a href=\"{m.Value}\" style=\"color:{BrandRed};word-break:break-all;\">{m.Value}</a>");
            encoded = encoded.Replace("\n", "<br>");
            html.Append("<p style=\"margin:0 0 16px 0;\">").Append(encoded).Append("</p>");
        }

        var title = WebUtility.HtmlEncode(subject);
        return $@"<!DOCTYPE html>
<html lang=""en"">
<head><meta charset=""utf-8""><meta name=""viewport"" content=""width=device-width,initial-scale=1""><title>{title}</title></head>
<body style=""margin:0;padding:0;background:#f6f4f1;"">
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""background:#f6f4f1;padding:24px 12px;"">
<tr><td align=""center"">
<table role=""presentation"" width=""100%"" cellpadding=""0"" cellspacing=""0"" style=""max-width:560px;background:#ffffff;border:1px solid #e4e0db;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1a1d21;"">
<tr><td style=""background:{BrandRed};padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold;"">{BrandName}</td></tr>
<tr><td style=""padding:24px 24px 8px 24px;"">
<h1 style=""margin:0 0 16px 0;font-size:18px;line-height:1.4;color:#1a1d21;"">{title}</h1>
<div style=""font-size:15px;line-height:1.6;color:#1a1d21;"">{html}</div>
</td></tr>
<tr><td style=""padding:16px 24px;border-top:1px solid #e4e0db;font-size:12px;line-height:1.5;color:#5b6066;"">
This is an automated message from the {BrandName}. Please do not reply to this email.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>";
    }
}
