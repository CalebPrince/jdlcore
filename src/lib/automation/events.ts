import "server-only";
import { requireDb } from "@/db";
import { automationEvents } from "@/db/schema";

/**
 * Claims a (kind, ref) pair. Returns true only for the caller that actually inserted the
 * row, so "send the reminder" can be gated on it and re-runs never double-notify. Throws
 * if the automation_events table is missing (scripts/2026-09-21-automation.sql), which
 * the cron runner reports per task instead of silently skipping.
 */
export async function claimEvent(kind: string, ref: string): Promise<boolean> {
  const rows = await requireDb()
    .insert(automationEvents)
    .values({ kind, ref })
    .onConflictDoNothing()
    .returning({ id: automationEvents.id });
  return rows.length > 0;
}
