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

const client = usable(rawUrl) ? postgres(rawUrl, { prepare: false }) : null;

export const db = client ? drizzle(client, { schema }) : null;

export function requireDb() {
  if (!db) {
    throw new Error(
      "DATABASE_URL is not set. Add your Supabase connection string to .env"
    );
  }
  return db;
}
