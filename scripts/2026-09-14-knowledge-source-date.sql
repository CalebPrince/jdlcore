-- Adds knowledge_documents.source_date: the document's own real-world date
-- (e.g. an "As of 10th August, 2026" price indicator's actual date), distinct
-- from created_at (when we happened to ingest it). Used to sort the admin
-- knowledge-base table by the document's actual date, latest first.
-- Run in the Supabase SQL Editor.

ALTER TABLE knowledge_documents
  ADD COLUMN IF NOT EXISTS source_date timestamptz;
