-- Remembers each run of the scheduled automations, so the admin "Automations" page can show when
-- each one last ran and how it went. Safe to re-run. Rows older than 30 days are pruned by the
-- daily run. Until this is applied the automations work exactly as before; the page just has no
-- run history to show.

CREATE TABLE IF NOT EXISTS automation_runs (
  id          serial PRIMARY KEY,
  source      text NOT NULL,            -- daily | hourly | npa
  task        text NOT NULL,            -- e.g. invoice-reminders
  ok          boolean NOT NULL,
  ms          integer NOT NULL DEFAULT 0,
  summary     jsonb,                    -- what the task reported doing
  error       text,
  started_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_runs_task_started_idx
  ON automation_runs (task, started_at DESC);

INSERT INTO schema_migrations (name) VALUES ('0007_automation_runs') ON CONFLICT (name) DO NOTHING;
