-- 1. Keeps the original file name of uploaded job documents and payment receipts, so a download
--    comes back as the same file that was sent (right name and extension) instead of an
--    extensionless file that opens as text.
-- 2. Lets a job chat message carry one attachment (a document, picture or voice note), stored the
--    same way as job documents (base64 data URL). body stays NOT NULL; a file-only message has ''.
-- Safe to re-run.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receipt_file_name text;

ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS attachment_data text;
ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS attachment_name text;
ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS attachment_mime text;
ALTER TABLE job_comments ADD COLUMN IF NOT EXISTS attachment_size integer;

INSERT INTO schema_migrations (name) VALUES ('0014_upload_file_names_and_chat_attachments') ON CONFLICT (name) DO NOTHING;
