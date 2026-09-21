import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { inspectors, jobs } from "@/db/schema";

export type RankedInspector = { id: number; name: string; openJobs: number; clientJobs: number };

const OPEN_STATUSES = ["assigned", "inspector_accepted", "in_progress", "rejected_amendment"];

/**
 * Active inspectors ordered by who is the best default for a job: fewest open jobs first, then
 * the most prior work for the same client (they already know the site). Only ranks; a person
 * still presses Assign. Queries run one at a time on purpose (see the note in the admin job page).
 */
export async function rankInspectorsForJob(clientId: number, excludeInspectorId?: number | null): Promise<RankedInspector[]> {
  const database = requireDb();
  const active = await database
    .select({ id: inspectors.id, name: inspectors.name })
    .from(inspectors)
    .where(and(eq(inspectors.active, true), eq(inspectors.status, "active")));

  const open = await database
    .select({ inspectorId: jobs.assignedInspectorId, n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(isNotNull(jobs.assignedInspectorId), inArray(jobs.status, OPEN_STATUSES)))
    .groupBy(jobs.assignedInspectorId);
  const forClient = await database
    .select({ inspectorId: jobs.assignedInspectorId, n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(isNotNull(jobs.assignedInspectorId), eq(jobs.clientId, clientId)))
    .groupBy(jobs.assignedInspectorId);

  const openBy = new Map(open.map((r) => [r.inspectorId, r.n]));
  const clientBy = new Map(forClient.map((r) => [r.inspectorId, r.n]));

  return active
    .map((i) => ({ ...i, openJobs: openBy.get(i.id) ?? 0, clientJobs: clientBy.get(i.id) ?? 0 }))
    .sort(
      (a, b) =>
        Number(a.id === excludeInspectorId) - Number(b.id === excludeInspectorId) ||
        a.openJobs - b.openJobs ||
        b.clientJobs - a.clientJobs ||
        a.name.localeCompare(b.name),
    );
}
