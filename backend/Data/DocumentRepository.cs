using Dapper;
using backend.Models;

namespace backend.Data;

public interface IDocumentRepository
{
    Task<int> CreateAsync(Document document);
    Task<Document?> GetByRequestIdAsync(int requestId);
}

public class DocumentRepository : IDocumentRepository
{
    private readonly IDbConnectionFactory _factory;

    public DocumentRepository(IDbConnectionFactory factory)
    {
        _factory = factory;
    }

    // Insert a document row carrying the file bytes. doc_type keeps a short label
    // ("pdf"/"image"); file_path is left null (files now live in the DB — migration 004).
    public async Task<int> CreateAsync(Document document)
    {
        const string sql = @"
            INSERT INTO documents (request_id, file_name, content_type, file_bytes, doc_type)
            VALUES (@RequestId, @FileName, @ContentType, @FileBytes, @DocType)
            RETURNING document_id;";

            using var connection = _factory.CreateConnection();
            return await connection.ExecuteScalarAsync<int>(sql, new
            {
                document.RequestId,
                document.FileName,
                document.ContentType,
                document.FileBytes,
                DocType = document.ContentType.StartsWith("image/") ? "image" : "pdf",
            });
    }

    //Fetch the most recent document for a request including its bytes for download
    public async Task<Document?> GetByRequestIdAsync(int requestId)
    {
        const string sql = @"
            SELECT document_id   AS DocumentId,
                   request_id    AS RequestId,
                   file_name     AS FileName,
                   content_type  AS ContentType,
                   file_bytes    AS FileBytes,
                   uploaded_at   AS UploadedAt
            FROM documents
            WHERE request_id = @RequestId
            ORDER BY uploaded_at DESC
            LIMIT 1;";

        using var connection = _factory.CreateConnection();
        return await connection.QuerySingleOrDefaultAsync<Document>(sql, new { RequestId = requestId });
    }
}
