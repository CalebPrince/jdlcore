-- Remembers how far each person has read each job's group chat, so job lists and job pages can
-- show an unread-message count. One row per (job, reader). reader_type is client | staff |
-- inspector and reader_id is that person's id in their own table.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS job_chat_reads (
  id serial PRIMARY KEY,
  job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reader_type text NOT NULL,
  reader_id integer NOT NULL,
  last_read_message_id integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS job_chat_reads_reader_unique ON job_chat_reads (job_id, reader_type, reader_id);
CREATE INDEX IF NOT EXISTS job_chat_reads_reader_idx ON job_chat_reads (reader_type, reader_id);

-- Everything already in a chat counts as read, so nobody starts with a pile of old "unread" messages.
INSERT INTO job_chat_reads (job_id, reader_type, reader_id, last_read_message_id)
SELECT j.id, 'client', j.client_id, m.max_id
FROM jobs j
JOIN (SELECT job_id, max(id) AS max_id FROM job_comments GROUP BY job_id) m ON m.job_id = j.id
ON CONFLICT (job_id, reader_type, reader_id) DO NOTHING;

INSERT INTO job_chat_reads (job_id, reader_type, reader_id, last_read_message_id)
SELECT j.id, 'inspector', j.assigned_inspector_id, m.max_id
FROM jobs j
JOIN (SELECT job_id, max(id) AS max_id FROM job_comments GROUP BY job_id) m ON m.job_id = j.id
WHERE j.assigned_inspector_id IS NOT NULL
ON CONFLICT (job_id, reader_type, reader_id) DO NOTHING;

INSERT INTO job_chat_reads (job_id, reader_type, reader_id, last_read_message_id)
SELECT m.job_id, 'staff', s.id, m.max_id
FROM (SELECT job_id, max(id) AS max_id FROM job_comments GROUP BY job_id) m
CROSS JOIN staff s
ON CONFLICT (job_id, reader_type, reader_id) DO NOTHING;

INSERT INTO schema_migrations (name) VALUES ('0015_job_chat_reads') ON CONFLICT (name) DO NOTHING;
