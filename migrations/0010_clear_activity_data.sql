-- One-time cleanup: the site has no real usage yet, only test data from development. This
-- clears every activity/log table (admin audit log, job status timeline, in-app notifications,
-- outgoing email log, inbox submissions that feed the "Recent Activity" dashboard card, and the
-- scheduled-automation run log) while leaving every account and business record untouched
-- (staff, clients, inspectors, users, jobs, services, tanks, invoices, payments).
--
-- Guarded so pasting this file again later (after real activity has accumulated) is a no-op,
-- matching the "every file is safe to re-run" rule even though the action itself is destructive.
-- destructive-ok: client requested a clean slate before go-live; only test/demo data exists in
-- these tables so far

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '0010_clear_activity_data') THEN
    TRUNCATE TABLE
      audit_log,
      job_updates,
      notifications,
      email_log,
      submissions,
      automation_runs
    RESTART IDENTITY;
  END IF;
END $$;

INSERT INTO schema_migrations (name) VALUES ('0010_clear_activity_data') ON CONFLICT (name) DO NOTHING;
