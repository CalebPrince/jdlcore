import "server-only";
import { lt } from "drizzle-orm";
import { requireDb } from "@/db";
import { automationRuns } from "@/db/schema";

export type TaskOutcome = { name: string; ok: boolean; ms: number; result?: unknown; error?: string };

/**
 * Runs one automation task in isolation: a failure (or a missing table) in one task is
 * reported in the summary and never stops the others.
 */
export async function runTask(name: string, fn: () => Promise<unknown>): Promise<TaskOutcome> {
  const start = Date.now();
  try {
    const result = await fn();
    return { name, ok: true, ms: Date.now() - start, result };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`automation task "${name}" failed:`, err);
    return { name, ok: false, ms: Date.now() - start, error };
  }
}

/**
 * Remembers the outcome of each task so the admin Automations page can show when it last ran and how
 * it went. Best-effort: recording never affects the tasks themselves, and if the history table isn't
 * there yet it simply records nothing. Old rows (30 days+) are pruned as we go.
 */
export async function recordRuns(source: "daily" | "hourly" | "npa", outcomes: TaskOutcome[]): Promise<void> {
  try {
    const database = requireDb();
    if (outcomes.length > 0) {
      await database.insert(automationRuns).values(
        outcomes.map((o) => ({
          source,
          task: o.name,
          ok: o.ok,
          ms: o.ms,
          summary: o.result === undefined ? null : (o.result as object),
          error: o.error ?? null,
        })),
      );
    }
    if (source === "daily") {
      await database.delete(automationRuns).where(lt(automationRuns.startedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
    }
  } catch (err) {
    console.error("recordRuns:", err);
  }
}
