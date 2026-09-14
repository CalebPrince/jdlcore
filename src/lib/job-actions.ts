import "server-only";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, jobs, jobUpdates } from "@/db/schema";
import { canTransition, type Actor } from "@/lib/job-workflow";
import type { JobStatus } from "@/lib/jobs";
import { generateCoqAndInvoice } from "@/lib/coq";

/**
 * Shared job-approval business logic, reused by both the direct staff-facing
 * Server Action (src/app/actions/job-workflow.ts) and the reviewed-actions
 * pipeline (src/lib/reviewed-actions.ts) that lets the agent propose the same
 * action for a human to approve. There is exactly one place this runs.
 */

export type StaffActor = { id: number; name: string; role: string };

function revalidateJob(jobId: number): void {
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  revalidatePath("/admin/actions");
  revalidatePath(`/portal/jobs/${jobId}`);
  revalidatePath("/portal");
}

/** Resolves the human-facing job reference (e.g. "JDL-2026-0042") to its numeric id — the identifier the model actually sees in evidence text, versus the id the rest of this pipeline keys on. */
export async function findJobIdByRef(ref: string): Promise<number | null> {
  const rows = await requireDb().select({ id: jobs.id }).from(jobs).where(eq(jobs.ref, ref.trim().toUpperCase())).limit(1);
  return rows[0]?.id ?? null;
}

export async function loadJobForApproval(jobId: number) {
  const rows = await requireDb()
    .select({
      id: jobs.id,
      ref: jobs.ref,
      status: jobs.status,
      service: jobs.service,
      clientId: jobs.clientId,
      clientName: clients.name,
      clientCompany: clients.company,
    })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Reuses the job-workflow transition rule to decide whether an approval
 * proposal even makes sense right now, and prepares the exact change it
 * would make — a snapshot of current state plus a human-readable summary —
 * without touching anything. Called at proposal time by
 * proposeJobApproval(); the same canTransition() check runs again,
 * independently, at approval time (see approveReviewedJobApproval below).
 */
export function checkJobApprovable(
  job: { status: string },
  actor: Actor,
): { ok: true } | { ok: false; message: string } {
  if (!canTransition(job.status as JobStatus, "approved", actor)) {
    return { ok: false, message: "This job isn't awaiting approval." };
  }
  return { ok: true };
}

export type JobApprovalResult = { ok: boolean; message: string };

/**
 * The actual state change: job -> approved -> report_issued -> invoice_issued,
 * Certificate of Quantity and invoice generated, client notified — extracted
 * verbatim from the original approveJob Server Action so both the direct
 * staff action and the reviewed-actions executor run the identical logic.
 */
export async function approveJobCore(jobId: number, staff: StaffActor): Promise<JobApprovalResult> {
  const job = await loadJobForApproval(jobId);
  if (!job) return { ok: false, message: "Job not found." };
  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, role: staff.role as Actor["role"] };
  const check = checkJobApprovable(job, actor);
  if (!check.ok) return check;

  const database = requireDb();
  const now = new Date();
  await database
    .update(jobs)
    .set({ status: "approved", approvedAt: now, approvedByStaffId: staff.id, updatedAt: now })
    .where(eq(jobs.id, jobId));
  for (const status of ["approved", "report_issued", "invoice_issued"] as const) {
    await database.insert(jobUpdates).values({
      jobId,
      status,
      note: status === "approved" ? `Approved by ${staff.name}.` : null,
      actorType: status === "approved" ? "staff" : "system",
      actorId: status === "approved" ? staff.id : null,
      actorName: status === "approved" ? staff.name : "JDL Core",
    });
  }
  await database.update(jobs).set({ status: "invoice_issued", updatedAt: new Date() }).where(eq(jobs.id, jobId));

  await generateCoqAndInvoice(jobId, staff.id);

  revalidateJob(jobId);
  return { ok: true, message: "Job approved — Certificate of Quantity and invoice issued." };
}
