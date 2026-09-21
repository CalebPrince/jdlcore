import "server-only";
import { requireDb } from "@/db";
import { schemaMigrations } from "@/db/schema";

/**
 * Every migration this version of the code depends on, oldest first. Add the new file's name
 * here whenever you add a file to /migrations (`npm run db:migrate -- check` fails until you do).
 */
export const REQUIRED_MIGRATIONS = [
  "0001_schema_migrations",
  "0002_knowledge_source_date",
  "0003_invoice_tax_breakdown",
  "0004_automation_events_email_retry",
  "0005_auto_assignment_and_approval",
  "0006_backfill_job_service_types",
  "0007_automation_runs",
  "0008_outturn_and_calibration",
  "0009_outturn_multi_tank",
] as const;

function isMissingTable(err: unknown): boolean {
  const parts: string[] = [];
  for (let e: unknown = err; e && parts.length < 4; e = (e as { cause?: unknown }).cause) {
    parts.push(String((e as { message?: string }).message ?? ""), String((e as { code?: string }).code ?? ""));
  }
  return /does not exist|42P01/i.test(parts.join(" "));
}

/**
 * Catches the classic "deployed the code before running the SQL" mistake. Compares the ledger to
 * REQUIRED_MIGRATIONS and, when the database is behind (or the ledger was never installed), FAILS
 * this task. That is deliberately developer-only: it shows as a failed task in the cron response
 * and logs, and is never sent to the business's staff or shown in the admin screens. Read-only; it
 * never applies anything itself.
 */
export async function runSchemaCheck() {
  let applied: Set<string>;
  let ledgerInstalled = true;
  try {
    const rows = await requireDb().select({ name: schemaMigrations.name }).from(schemaMigrations);
    applied = new Set(rows.map((r) => r.name));
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    ledgerInstalled = false;
    applied = new Set();
  }

  const missing = REQUIRED_MIGRATIONS.filter((name) => !applied.has(name));
  if (missing.length === 0) return { behind: false, missing: [] as string[] };

  const message = ledgerInstalled
    ? `Database is behind the code. Not applied: ${missing.join(", ")}`
    : `Migration ledger not installed. Apply migrations/0001 first, then: ${missing.join(", ")}`;
  console.error(`[schema-check] ${message}`);
  throw new Error(message);
}
