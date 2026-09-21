import "server-only";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, inspectorAssignmentProfiles, inspectors, jobUpdates, jobs, services } from "@/db/schema";
import { SERVICE_TYPE_LABEL } from "@/lib/jobs";
import { brandedEmailHtml } from "@/lib/email";
import { notifyBoth } from "@/lib/notifications";
import { chooseInspector, type PickResult } from "@/lib/assignment-rules";

export const OPEN_JOB_STATUSES = ["assigned", "inspector_accepted", "in_progress", "rejected_amendment"];

type JobRow = typeof jobs.$inferSelect;

export type AssignActor = { type: "staff" | "system"; id: number | null; name: string };

/**
 * The one place a job is handed to an inspector: updates the job, writes the timeline entry, and
 * tells the inspector and the client. Used by the manual Assign button and by auto-assignment so
 * both behave identically. The update is guarded on the job's current status, so two callers racing
 * for the same job can't both succeed. System-made timeline rows deliberately keep actorId null:
 * a non-null actorId on a system row marks "this inspector was already tried" (see triedInspectorIds).
 */
export async function assignJobToInspector(input: {
  jobId: number;
  inspectorId: number;
  actor: AssignActor;
  note: (inspectorName: string, isReassign: boolean) => string;
}): Promise<{ ok: true; inspectorName: string; isReassign: boolean } | { ok: false; reason: string }> {
  const database = requireDb();
  const jobRows = await database.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
  const job = jobRows[0];
  if (!job) return { ok: false, reason: "Job not found." };

  const inspRows = await database.select().from(inspectors).where(eq(inspectors.id, input.inspectorId)).limit(1);
  const inspector = inspRows[0];
  if (!inspector || !inspector.active || inspector.status !== "active") {
    return { ok: false, reason: "Inspector not found or inactive." };
  }

  const isReassign = job.status === "assigned";
  const now = new Date();
  const updated = await database
    .update(jobs)
    .set({ status: "assigned", assignedInspectorId: inspector.id, assignedAt: now, updatedAt: now })
    .where(and(eq(jobs.id, job.id), eq(jobs.status, job.status)))
    .returning({ id: jobs.id });
  if (updated.length === 0) return { ok: false, reason: "The job changed while assigning. Refresh and try again." };

  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: "assigned",
    note: input.note(inspector.name, isReassign),
    actorType: input.actor.type,
    actorId: input.actor.id,
    actorName: input.actor.name,
  });

  await notifyBoth({
    recipientType: "inspector",
    recipientId: inspector.id,
    email: inspector.email,
    jobId: job.id,
    type: "new_assignment",
    title: `New assignment — ${job.ref}`,
    body: `You've been assigned to ${job.service}.`,
    link: `/inspector/jobs/${job.id}`,
    emailSubject: `[${job.ref}] New assignment - JDL Core`,
    emailHtml: brandedEmailHtml({
      label: "JDL CORE INSPECTOR PORTAL",
      heading: `New assignment — ${job.ref}`,
      bodyLines: [`You've been assigned to ${job.service}.`],
      ctaUrl: "https://jdlcore.com/inspector",
      ctaLabel: "Open Inspector Portal",
      footer: `Job reference: ${job.ref}`,
    }),
  });

  const clientRows = await database
    .select({ email: clients.email, clientId: clients.id })
    .from(clients)
    .where(eq(clients.id, job.clientId))
    .limit(1);
  if (clientRows[0]) {
    await notifyBoth({
      recipientType: "client",
      recipientId: clientRows[0].clientId,
      email: clientRows[0].email,
      jobId: job.id,
      type: "inspector_assigned",
      title: `Inspector assigned — ${job.ref}`,
      link: `/portal/jobs/${job.id}`,
      emailSubject: `[${job.ref}] Inspector assigned - JDL Core`,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE CLIENT PORTAL",
        heading: `Inspector assigned — ${job.ref}`,
        bodyLines: ["An inspector has been assigned to your request."],
        ctaUrl: "https://jdlcore.com/portal",
        ctaLabel: "Open the portal",
        footer: `Job reference: ${job.ref}`,
      }),
    });
  }

  return { ok: true, inspectorName: inspector.name, isReassign };
}

/**
 * Inspectors that have already had this job and shouldn't get it again: ones who declined it, and
 * ones auto-reassigned away from because they didn't respond in time.
 */
export async function triedInspectorIds(jobId: number): Promise<number[]> {
  const rows = await requireDb()
    .select({ actorId: jobUpdates.actorId })
    .from(jobUpdates)
    .where(
      and(
        eq(jobUpdates.jobId, jobId),
        isNotNull(jobUpdates.actorId),
        or(
          and(eq(jobUpdates.actorType, "inspector"), eq(jobUpdates.status, "awaiting_assignment")),
          eq(jobUpdates.actorType, "system"),
        ),
      ),
    );
  return [...new Set(rows.map((r) => r.actorId as number))];
}

export type { PickResult } from "@/lib/assignment-rules";

/**
 * Loads the inspectors who are switched on for auto-assignment, and the workload figures, then
 * applies the rules in assignment-rules.ts (which explains how a winner is chosen).
 */
export async function pickInspectorForJob(job: JobRow, excludeInspectorIds: number[] = []): Promise<PickResult> {
  if (!job.serviceType) return { found: false, why: "the job has no service type set" };
  const database = requireDb();

  const candidates = await database
    .select({
      id: inspectors.id,
      name: inspectors.name,
      regions: inspectorAssignmentProfiles.regions,
      serviceTypes: inspectorAssignmentProfiles.serviceTypes,
      maxOpenJobs: inspectorAssignmentProfiles.maxOpenJobs,
      unavailableUntil: inspectorAssignmentProfiles.unavailableUntil,
    })
    .from(inspectorAssignmentProfiles)
    .innerJoin(inspectors, eq(inspectors.id, inspectorAssignmentProfiles.inspectorId))
    .where(
      and(
        eq(inspectorAssignmentProfiles.autoAssignEnabled, true),
        eq(inspectors.active, true),
        eq(inspectors.status, "active"),
      ),
    );
  if (candidates.length === 0) return { found: false, why: "no inspector is switched on for auto-assignment" };

  const open = await database
    .select({ inspectorId: jobs.assignedInspectorId, n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(isNotNull(jobs.assignedInspectorId), inArray(jobs.status, OPEN_JOB_STATUSES)))
    .groupBy(jobs.assignedInspectorId);
  const forClient = await database
    .select({ inspectorId: jobs.assignedInspectorId, n: sql<number>`count(*)::int` })
    .from(jobs)
    .where(and(isNotNull(jobs.assignedInspectorId), eq(jobs.clientId, job.clientId)))
    .groupBy(jobs.assignedInspectorId);

  return chooseInspector(
    job,
    candidates,
    new Map(open.map((r) => [r.inspectorId, r.n])),
    new Map(forClient.map((r) => [r.inspectorId, r.n])),
    excludeInspectorIds,
  );
}

/**
 * Maps a free-text service name (from a quote form or the admin "create job" form) to the service
 * key that auto-assignment and auto-invoicing match on. Accepts a key ("stock_monitoring"), a label
 * from the services table, or one of the built-in labels, ignoring case. Returns null when unsure,
 * in which case the job simply isn't auto-assigned.
 */
export async function resolveServiceType(text: string | null | undefined): Promise<string | null> {
  const wanted = (text ?? "").trim().toLowerCase();
  if (!wanted) return null;
  const rows = await requireDb().select({ key: services.key, label: services.label }).from(services);
  const hit = rows.find((s) => s.key.toLowerCase() === wanted || s.label.toLowerCase() === wanted);
  if (hit) return hit.key;
  const builtIn = (Object.entries(SERVICE_TYPE_LABEL) as [string, string][]).find(
    ([key, label]) => key === wanted || label.toLowerCase() === wanted,
  );
  return builtIn ? builtIn[0] : null;
}
