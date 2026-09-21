-- Scheduled-automation support. Safe to re-run.
--
-- automation_events: idempotency ledger so cron reminders/alerts/nudges are only ever
-- sent once per (kind, ref). Without this table the daily cron reports an error for the
-- tasks that need it and skips them; nothing else in the app is affected.

CREATE TABLE IF NOT EXISTS automation_events (
  id          serial PRIMARY KEY,
  kind        text NOT NULL,
  ref         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_events_kind_ref_idx
  ON automation_events (kind, ref);

-- email_log: keep the body of a failed send so the daily cron can retry it, and count attempts.
-- Until this runs, emails behave exactly as before (logged, not retried).
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS html text;
ALTER TABLE email_log ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1;

INSERT INTO schema_migrations (name) VALUES ('0004_automation_events_email_retry') ON CONFLICT (name) DO NOTHING;
