-- One-time cleanup, follow-up to 0010: the client confirmed there are no real jobs yet, only
-- test data. Deleting every row in `jobs` lets the existing foreign-key rules do the rest:
--   - cascade-deleted (job-scoped, so it's right that they go with the job): job_updates,
--     job_completion_data, job_outturns (and job_outturn_tanks, which cascades from job_outturns),
--     stock_readings, stock_imports, job_comments, ai_reviews, certificates, documents, invoices,
--     job_approval_checks, notifications
--   - reference only nulled, row kept (these tables hold data that isn't exclusively job-scoped,
--     e.g. Analytics subscription charges live in payment_transactions too): submissions
--     (converted_job_id), payment_transactions (invoice_id, nulled when its invoice cascades away)
-- Clients, staff, inspectors, services, and tanks/calibration data are untouched — nothing
-- references those FROM jobs in a way that would delete them.
--
-- Guarded so pasting this file again later (after real jobs exist) is a no-op.
-- destructive-ok: client confirmed no real jobs exist yet, only test data

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '0011_clear_test_jobs') THEN
    DELETE FROM jobs;
  END IF;
END $$;

INSERT INTO schema_migrations (name) VALUES ('0011_clear_test_jobs') ON CONFLICT (name) DO NOTHING;
