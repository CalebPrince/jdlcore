-- Adds the Ghana tax-levy breakdown to invoices (NHIL 2.5%, GETFund 2.5%, VAT 15%,
-- each computed on the subtotal and added to reach amount_cents). Null on existing
-- invoices (issued before this existed) and on non-GHS invoices — those keep showing
-- as a single flat amount with no breakdown. Safe to re-run.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS subtotal_cents integer,
  ADD COLUMN IF NOT EXISTS nhil_cents integer,
  ADD COLUMN IF NOT EXISTS getfund_cents integer,
  ADD COLUMN IF NOT EXISTS vat_cents integer;

INSERT INTO schema_migrations (name) VALUES ('0003_invoice_tax_breakdown') ON CONFLICT (name) DO NOTHING;
