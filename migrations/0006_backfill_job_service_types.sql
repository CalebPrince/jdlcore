-- Fills in the service type on existing jobs that were created without one (older admin-created
-- jobs and quotes converted from free text). Auto-assignment, auto-invoicing and the stock
-- readings panel all key off jobs.service_type. Only touches rows where it is NULL, and only when
-- the job's service name matches exactly one service, so anything unclear is left for a person.
-- Safe to re-run. The matching rules mirror src/lib/service-match.ts.

UPDATE jobs j
SET service_type = m.key
FROM (
  SELECT j2.id AS job_id, min(s.key) AS key, count(DISTINCT s.key) AS n
  FROM jobs j2
  JOIN services s
    ON regexp_replace(regexp_replace(btrim(regexp_replace(regexp_replace(lower(replace(j2.service, '&', ' and ')), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')), '\s+services?$', ''), ' |s$', '', 'g')
     = regexp_replace(regexp_replace(btrim(regexp_replace(regexp_replace(lower(replace(s.label, '&', ' and ')), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')), '\s+services?$', ''), ' |s$', '', 'g')
    OR regexp_replace(regexp_replace(btrim(regexp_replace(regexp_replace(lower(replace(j2.service, '&', ' and ')), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')), '\s+services?$', ''), ' |s$', '', 'g')
     = regexp_replace(regexp_replace(btrim(regexp_replace(regexp_replace(lower(replace(replace(s.key, '_', ' '), '&', ' and ')), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')), '\s+services?$', ''), ' |s$', '', 'g')
  WHERE j2.service_type IS NULL
  GROUP BY j2.id
) m
WHERE j.id = m.job_id AND m.n = 1 AND j.service_type IS NULL;

INSERT INTO schema_migrations (name) VALUES ('0006_backfill_job_service_types') ON CONFLICT (name) DO NOTHING;
