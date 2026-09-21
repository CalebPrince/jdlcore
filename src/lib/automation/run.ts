import "server-only";

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
