-- Exact failing NPA document URLs, grouped by error message, for diagnosis.
-- Run in the Supabase SQL Editor.
SELECT error, count(*) AS how_many, array_agg(url ORDER BY id DESC) FILTER (WHERE url IS NOT NULL) AS sample_urls
FROM knowledge_documents
WHERE status = 'failed' AND url LIKE 'https://npa.gov.gh/%'
GROUP BY error
ORDER BY how_many DESC;
