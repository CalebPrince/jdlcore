import "server-only";
import { and, eq, isNotNull, like, lt, or } from "drizzle-orm";
import { requireDb } from "@/db";
import { inspectors, jobUpdates, jobs } from "@/db/schema";
import { assignJobToInspector, pickInspectorForJob, triedInspectorIds } from "@/lib/assignment";
import { brandedEmailHtml } from "@/lib/email";
import { canTransition, type Actor } from "@/lib/job-workflow";
import type { JobStatus } from "@/lib/jobs";
import { notifyBoth, notifyStaffBoth } from "@/lib/notifications";
import { getAutomationSettings } from "@/lib/settings";
import { claimEvent } from "./events";

const SYSTEM_ACTOR: Actor = { type: "system", id: 0, name: "JDL Core" };
/** After this many automatic hand-offs a job goes to a person instead of bouncing between inspectors. */
const MAX_AUTO_REASSIGNMENTS = 2;

export type AutoAssignOutcome =
  | { outcome: "assigned"; inspectorName: string }
  | { outcome: "disabled" | "not_awaiting" | "error" }
  | { outcome: "no_match"; why: string };

/**
 * Assigns a job that is waiting for an inspector, if auto-assignment is switched on and someone
 * eligible exists (rules in pickInspectorForJob). Best-effort and never throws: on any problem the
 * job just stays in the queue for Operations, exactly as before. Called when a job is created,
 * when an inspector declines, and by the daily sweep.
 */
export async function maybeAutoAssign(jobId: number): Promise<AutoAssignOutcome> {
  try {
    const settings = await getAutomationSettings();
    if (settings.autoAssign !== "1") return { outcome: "disabled" };

    const database = requireDb();
    const rows = await database.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    const job = rows[0];
    if (!job || job.status !== "awaiting_assignment") return { outcome: "not_awaiting" };
    if (!canTransition(job.status as JobStatus, "assigned", SYSTEM_ACTOR)) return { outcome: "error" };

    const pick = await pickInspectorForJob(job, await triedInspectorIds(job.id));
    if (!pick.found) {
      // Say why once, so the timeline explains why nobody was assigned automatically.
      if (await claimEvent("auto_assign_no_match", String(job.id))) {
        await database.insert(jobUpdates).values({
          jobId: job.id,
          status: "awaiting_assignment",
          note: `Auto-assignment found no eligible inspector (${pick.why}). Waiting for Operations to assign.`,
          actorType: "system",
          actorId: null,
          actorName: "JDL Core",
        });
        // Tell Operations straight away (once per job) rather than leaving it for the next morning's digest.
        const title = `${job.ref} needs an inspector`;
        const body = `Automatic assignment couldn't find a suitable inspector (${pick.why}). Please assign one.`;
        await notifyStaffBoth({
          roles: ["operations", "administrator", "superadmin"],
          type: "auto_assign_no_match",
          title,
          body,
          link: `/admin/jobs/${job.id}`,
          emailSubject: `[${job.ref}] Needs an inspector`,
          emailHtml: brandedEmailHtml({
            label: "JDL CORE ADMIN",
            heading: title,
            bodyLines: [body],
            ctaUrl: `https://jdlcore.com/admin/jobs/${job.id}`,
            ctaLabel: "Open Job",
            footer: `Job reference: ${job.ref}`,
          }),
        });
      }
      return { outcome: "no_match", why: pick.why };
    }

    const result = await assignJobToInspector({
      jobId: job.id,
      inspectorId: pick.inspectorId,
      actor: { type: "system", id: null, name: "JDL Core" },
      note: (name) => `Auto-assigned to ${name} because they ${pick.reason}.`,
    });
    return result.ok ? { outcome: "assigned", inspectorName: result.inspectorName } : { outcome: "error" };
  } catch (err) {
    console.error("maybeAutoAssign:", err);
    return { outcome: "error" };
  }
}

/**
 * Daily sweep. (1) Retries jobs still waiting for an inspector, since capacity or availability may
 * have changed. (2) Moves a job on when its inspector hasn't accepted within the configured hours.
 * The schedule is daily, so a "24 hour" limit really means: at the first run after 24 hours.
 */
export async function runAutoAssignSweep() {
  const settings = await getAutomationSettings();
  if (settings.autoAssign !== "1") return { enabled: false, assigned: 0, reassigned: 0, unmatched: 0 };

  const database = requireDb();
  let assigned = 0;
  let unmatched = 0;
  let reassigned = 0;

  const waiting = await database.select({ id: jobs.id }).from(jobs).where(eq(jobs.status, "awaiting_assignment"));
  for (const job of waiting) {
    const result = await maybeAutoAssign(job.id);
    if (result.outcome === "assigned") assigned += 1;
    else if (result.outcome === "no_match") unmatched += 1;
  }

  const hours = Math.max(1, Number(settings.reassignHours) || 24);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const stale = await database
    .select({ id: jobs.id, ref: jobs.ref, inspectorId: jobs.assignedInspectorId, assignedAt: jobs.assignedAt, updatedAt: jobs.updatedAt })
    .from(jobs)
    .where(and(eq(jobs.status, "assigned"), isNotNull(jobs.assignedInspectorId), or(lt(jobs.assignedAt, cutoff), lt(jobs.updatedAt, cutoff))));

  for (const stuck of stale) {
    const since = stuck.assignedAt ?? stuck.updatedAt;
    if (since > cutoff) continue;

    const jobRows = await database.select().from(jobs).where(eq(jobs.id, stuck.id)).limit(1);
    const job = jobRows[0];
    if (!job || job.status !== "assigned" || !job.assignedInspectorId) continue;

    const previous = await database
      .select({ n: jobUpdates.id })
      .from(jobUpdates)
      .where(and(eq(jobUpdates.jobId, job.id), eq(jobUpdates.actorType, "system"), like(jobUpdates.note, "Auto-reassigned%")));
    if (previous.length >= MAX_AUTO_REASSIGNMENTS) continue; // a person takes over; the digest still lists it

    const tried = await triedInspectorIds(job.id);
    const pick = await pickInspectorForJob(job, [...tried, job.assignedInspectorId]);
    if (!pick.found) continue; // nobody else fits; leave it with the current inspector and the digest

    const oldRows = await database.select().from(inspectors).where(eq(inspectors.id, job.assignedInspectorId)).limit(1);
    const old = oldRows[0];

    // Marks the previous inspector as tried (system row carrying their id), so they aren't picked again.
    const marker = await database
      .insert(jobUpdates)
      .values({
        jobId: job.id,
        status: "assigned",
        note: `Auto-reassigned from ${old?.name ?? "the previous inspector"}: no response within ${hours} hours.`,
        actorType: "system",
        actorId: job.assignedInspectorId,
        actorName: "JDL Core",
      })
      .returning({ id: jobUpdates.id });

    const result = await assignJobToInspector({
      jobId: job.id,
      inspectorId: pick.inspectorId,
      actor: { type: "system", id: null, name: "JDL Core" },
      note: (name) => `Auto-assigned to ${name} because they ${pick.reason}.`,
    });
    if (!result.ok) {
      // The hand-off didn't happen, so don't leave a marker claiming this inspector was replaced.
      await database.delete(jobUpdates).where(eq(jobUpdates.id, marker[0].id));
      continue;
    }
    reassigned += 1;

    if (old) {
      await notifyBoth({
        recipientType: "inspector",
        recipientId: old.id,
        email: old.email,
        jobId: job.id,
        type: "assignment_reassigned",
        title: `${job.ref} was reassigned`,
        link: "/inspector",
        emailSubject: `[${job.ref}] Assignment reassigned - JDL Core`,
        emailHtml: brandedEmailHtml({
          label: "JDL CORE INSPECTOR PORTAL",
          heading: `${job.ref} was reassigned`,
          bodyLines: [
            `This job wasn't accepted within ${hours} hours, so it has been given to another inspector. No action is needed.`,
          ],
          ctaUrl: "https://jdlcore.com/inspector",
          ctaLabel: "Open Inspector Portal",
          footer: `Job reference: ${job.ref}`,
        }),
      });
    }
  }

  return { enabled: true, assigned, reassigned, unmatched };
}
