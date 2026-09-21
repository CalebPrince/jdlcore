-- The migration ledger. Run this FIRST in the Supabase SQL Editor (or `npm run db:migrate -- up --yes`).
-- Safe to re-run.
--
-- One row per applied migration. Every file in this folder ends with an INSERT into this
-- table, so a migration pasted into the SQL Editor records itself; the runner
-- (scripts/migrate.cjs) also stamps a checksum so an edited-after-apply file is noticed.
-- Check what a database has with:  SELECT name, applied_at, applied_by FROM schema_migrations ORDER BY name;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        text PRIMARY KEY,
  checksum    text,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  applied_by  text NOT NULL DEFAULT 'manual'
);

INSERT INTO schema_migrations (name) VALUES ('0001_schema_migrations') ON CONFLICT (name) DO NOTHING;
