-- 004_add_document_storage.sql
-- Store uploaded supporting documents directly in the database.
-- The documents table was originally designed for filesystem storage (file_path);
-- this adds columns to hold the file content and its metadata so a document can be
-- stored and served entirely from Postgres (simpler for the prototype; a single
-- backup surface). file_path is kept for backward compatibility but is no longer
-- the source of the file.

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS file_bytes   bytea,
    ADD COLUMN IF NOT EXISTS file_name    varchar(255),
    ADD COLUMN IF NOT EXISTS content_type varchar(100);

-- file_path was NOT NULL and assumed a filesystem path. Since files now live in the
-- DB, relax it so a document row doesn't require a path.
ALTER TABLE documents
    ALTER COLUMN file_path DROP NOT NULL;