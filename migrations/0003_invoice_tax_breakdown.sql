-- Adds the Ghana tax-levy breakdown to invoices (NHIL 2.5%, GETFund 2.5%, VAT 15%,
-- each computed on the subtotal and added to reach amount_cents). Null on existing
-- invoices (issued before this existed) and on non-GHS invoices — those keep showing
-- as a single flat amount with no breakdown. Run in the Supabase SQL Editor.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS subtotal_cents integer,
  ADD COLUMN IF NOT EXISTS nhil_cents integer,
  ADD COLUMN IF NOT EXISTS getfund_cents integer,
  ADD COLUMN IF NOT EXISTS vat_cents integer;
