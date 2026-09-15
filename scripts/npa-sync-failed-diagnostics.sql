-- Detailed diagnostics on the most recent NPA ingestion failures.
-- Run in the Supabase SQL Editor.
SELECT title, url, error
FROM knowledge_documents
WHERE status = 'failed' AND url LIKE 'https://npa.gov.gh/%'
ORDER BY id DESC
LIMIT 10;
