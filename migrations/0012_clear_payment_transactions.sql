-- One-time cleanup, follow-up to 0011: clears every row in payment_transactions, including both
-- kind = 'invoice' (already-orphaned test-job payments) and kind = 'analytics_subscription'
-- (client confirmed the Analytics product also has no real paying customers yet). Nothing else
-- references this table, so it's a plain, self-contained clear.
--
-- Guarded so pasting this file again later (after real charges exist) is a no-op.
-- destructive-ok: client confirmed no real payments exist yet, only test data

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '0012_clear_payment_transactions') THEN
    TRUNCATE TABLE payment_transactions RESTART IDENTITY;
  END IF;
END $$;

INSERT INTO schema_migrations (name) VALUES ('0012_clear_payment_transactions') ON CONFLICT (name) DO NOTHING;
