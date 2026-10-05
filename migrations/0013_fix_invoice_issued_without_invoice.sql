-- Approving a job used to push it straight to "invoice_issued" even though no invoice had been
-- created, so the client was told an invoice existed but saw none. Approval now stops at
-- "report_issued" and the job only becomes "invoice_issued" when Operations issues the invoice.
-- This puts existing jobs right: any job sitting at "invoice_issued" with no invoice goes back to
-- "report_issued", and the misleading automatic "Invoice Issued" timeline entry is removed.
-- Jobs that do have an invoice are not touched. Safe to re-run.

DELETE FROM job_updates u
WHERE u.status = 'invoice_issued'
  AND u.actor_type = 'system'
  AND u.note IS NULL
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = u.job_id);

UPDATE jobs j
SET status = 'report_issued'
WHERE j.status = 'invoice_issued'
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.job_id = j.id);

INSERT INTO schema_migrations (name) VALUES ('0013_fix_invoice_issued_without_invoice') ON CONFLICT (name) DO NOTHING;
