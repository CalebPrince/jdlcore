import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const rawUrl = process.env.DATABASE_URL?.trim();

// Treat empty or obviously-placeholder values as "not configured" so the
// marketing site still renders (with default contact details) before
// Supabase is connected.
function usable(url: string | undefined): url is string {
  if (!url || url.includes("<")) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// Supabase's pooler (pgbouncer, transaction mode) already pools connections
// upstream — each serverless invocation only needs a handful of its own, not
// the postgres-js default of 10. Left uncapped, a page that fires many
// parallel queries (e.g. the job detail page) can exhaust the pooler's
// shared backend connection limit when a few requests land at once.
const client = usable(rawUrl)
  ? postgres(rawUrl, { prepare: false, max: 3, idle_timeout: 20 })
  : null;

export const db = client ? drizzle(client, { schema }) : null;

export function requireDb() {
  if (!db) {
    throw new Error(
      "DATABASE_URL is not set. Add your Supabase connection string to .env"
    );
  }
  return db;
}
