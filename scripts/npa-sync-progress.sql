-- Check NPA knowledge-base ingestion progress. Run in the Supabase SQL Editor.
SELECT
  status,
  count(*) AS documents,
  count(*) FILTER (WHERE url LIKE 'https://npa.gov.gh/%') AS npa_documents
FROM knowledge_documents
GROUP BY status
ORDER BY status;

-- Most recent failures, if any, to see why:
SELECT id, title, url, error, created_at
FROM knowledge_documents
WHERE status = 'failed' AND url LIKE 'https://npa.gov.gh/%'
ORDER BY created_at DESC
LIMIT 20;
