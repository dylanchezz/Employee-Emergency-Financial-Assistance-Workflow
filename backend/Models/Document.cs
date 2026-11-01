namespace backend.Models;

// Mirrors one row of the documents table (file stored in the DB as bytea).
public class Document
{
    public int DocumentId { get; set; }
    public int RequestId { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public byte[] FileBytes { get; set; } = Array.Empty<byte>();
    public DateTime UploadedAt { get; set; }
}