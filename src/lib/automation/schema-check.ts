import "server-only";
import { requireDb } from "@/db";
import { schemaMigrations } from "@/db/schema";
import { brandedEmailHtml } from "@/lib/email";
import { notifyStaffBoth } from "@/lib/notifications";
import { claimEvent } from "./events";

/**
 * Every migration this version of the code depends on, oldest first. Add the new file's name
 * here whenever you add a file to /migrations (`npm run db:migrate -- check` fails until you do).
 */
export const REQUIRED_MIGRATIONS = [
  "0001_schema_migrations",
  "0002_knowledge_source_date",
  "0003_invoice_tax_breakdown",
  "0004_automation_events_email_retry",
] as const;

const isoDay = () => new Date().toISOString().slice(0, 10);

function isMissingTable(err: unknown): boolean {
  const parts: string[] = [];
  for (let e: unknown = err; e && parts.length < 4; e = (e as { cause?: unknown }).cause) {
    parts.push(String((e as { message?: string }).message ?? ""), String((e as { code?: string }).code ?? ""));
  }
  return /does not exist|42P01/i.test(parts.join(" "));
}

/**
 * Catches the classic "deployed the code before running the SQL" mistake. Compares the ledger to
 * REQUIRED_MIGRATIONS and, when the database is behind (or the ledger was never installed), tells
 * administrators once a day until it's fixed. Read-only; it never applies anything itself.
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

  // If the dedupe table itself is what's missing, still alert: that is exactly this situation.
  let first = true;
  try {
    first = await claimEvent("schema_behind", isoDay());
  } catch {
    first = true;
  }
  if (first) {
    const title = ledgerInstalled
      ? `Database is behind the code: ${missing.length} migration${missing.length === 1 ? "" : "s"} not applied`
      : "Migration ledger not installed";
    await notifyStaffBoth({
      roles: ["administrator", "superadmin"],
      type: "schema_behind",
      title,
      body: missing.join(", "),
      link: "/admin/settings",
      emailSubject: title,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE ADMIN",
        heading: title,
        bodyLines: [
          ledgerInstalled
            ? "The deployed version expects database changes that haven't been applied, so some features may fail or be skipped."
            : "The database has no schema_migrations table yet, so applied migrations can't be verified.",
          `Not recorded: <strong>${missing.join(", ")}</strong>`,
          "Paste the missing files from the /migrations folder into the Supabase SQL Editor, in order. They are safe to re-run.",
        ],
      }),
    });
  }
  return { behind: true, missing: [...missing] };
}
