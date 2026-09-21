# Database migrations

Plain SQL files, applied in number order, each recorded in the `schema_migrations` table (the ledger).

## Applying to production (Supabase SQL Editor)

1. Paste the files you haven't applied yet into the SQL Editor, **oldest first**. Every file is safe to re-run, so if you are unsure whether one was applied, run it again.
2. Each file ends with an `INSERT INTO schema_migrations`, so it records itself.
3. See what a database has:

   ```sql
   SELECT name, applied_at, applied_by FROM schema_migrations ORDER BY name;
   ```

The very first time, run `0001_schema_migrations.sql` first (it creates the ledger). `0002` to `0004` were applied to production before the ledger existed; run them once more (harmless) so they get recorded.

If you deploy code that needs a migration you haven't applied, the daily cron run reports a failed `schema-check` task (visible in the Vercel cron log, never shown to staff) until you do.

## Using the runner (any database you can reach from your machine)

```bash
npm run db:migrate                 # status: applied / PENDING / MODIFIED
npm run db:migrate -- up           # dry run, shows what would be applied
npm run db:migrate -- up --yes     # apply pending migrations
npm run db:migrate -- check        # lint this folder (no database needed)
```

`DATABASE_URL` comes from `.env.local`, then `.env`. It is often the live database, so `up` does nothing without `--yes` and always prints the host first. The runner also stamps a checksum, and refuses to continue if an already-applied file was edited.

## Adding a migration

1. Create `NNNN_short_description.sql` with the next number (no gaps).
2. Make it idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
3. End it with the ledger insert, using its own name:

   ```sql
   INSERT INTO schema_migrations (name) VALUES ('0005_short_description') ON CONFLICT (name) DO NOTHING;
   ```

4. Add the name to `REQUIRED_MIGRATIONS` in `src/lib/automation/schema-check.ts`.
5. Update `src/db/schema.ts` to match.
6. Run `npm run db:migrate -- check`.

Never edit a migration after it has been applied; add a new one. `DROP` and `TRUNCATE` are rejected by `check` unless the file carries a `-- destructive-ok: <reason>` comment.

## History before the ledger

Earlier changes live in `scripts/migrate-*.cjs` and `scripts/2026-08-*.mjs`. They are idempotent and already applied to production, and they are kept for reference only. A brand-new database is built with `npm run db:push` (from `src/db/schema.ts`), then `npm run db:migrate -- up --yes` to install the ledger and record the rest.
