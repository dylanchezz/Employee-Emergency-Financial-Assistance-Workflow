using System.Globalization;
using System.Text;

namespace backend.Auth;

// Phase 6 (Part C) — a tiny CSV writer for the admin downloads (build decision 2: CSV, generated on
// the server, no new library). Two things it gets right that string.Join(",") would not:
//  1. RFC 4180 quoting — a value containing a comma, quote or newline is wrapped in quotes and its
//     quotes doubled, so free text (reasons, notes) can't break the columns.
//  2. Spreadsheet formula injection — a cell starting with = + - @ (or a tab/CR) can be executed as a
//     formula when the file is opened in Excel. Audit text contains user-typed reasons, so such cells
//     are prefixed with an apostrophe, which spreadsheets show as plain text.
public static class Csv
{
    public static string Build(IEnumerable<string> header, IEnumerable<IEnumerable<object?>> rows)
    {
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",", header.Select(Cell)));
        foreach (var row in rows)
        {
            sb.AppendLine(string.Join(",", row.Select(v => Cell(Format(v)))));
        }
        return sb.ToString();
    }

    // UTF-8 with a BOM so Excel opens accented names correctly; text/csv; download as an attachment.
    public static IResult File(string csv, string fileName) =>
        Results.File(Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray(),
            "text/csv; charset=utf-8", fileName);

    private static string Format(object? v) => v switch
    {
        null => "",
        DateOnly d => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        DateTime d when d.TimeOfDay == TimeSpan.Zero => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
        DateTime d => d.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        _ => v.ToString() ?? "",
    };

    private static string Cell(string value)
    {
        if (value.Length > 0 && "=+-@\t\r".Contains(value[0]) && !IsNumber(value))
        {
            value = "'" + value;
        }
        var needsQuotes = value.IndexOfAny(new[] { ',', '"', '\n', '\r' }) >= 0;
        return needsQuotes ? "\"" + value.Replace("\"", "\"\"") + "\"" : value;
    }

    // A plain negative number like -5 is data, not a formula — leave it alone.
    private static bool IsNumber(string s) =>
        decimal.TryParse(s, NumberStyles.Number, CultureInfo.InvariantCulture, out _);
}
