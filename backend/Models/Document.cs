namespace backend.Models;

public class Document
{
    public int DocumentId { get; set; }
    public int RequestId { get; set; }
    public string FileName { get; set; }
    public string ContentType { get; set; }
    public byte[] FileBytes { get; set; } = Array.Empty<byte>();
}