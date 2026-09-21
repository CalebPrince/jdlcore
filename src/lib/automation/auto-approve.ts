import "server-only";
import { desc, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { jobApprovalChecks, jobs } from "@/db/schema";
import { evaluateApproval, recordApprovalDecision } from "@/lib/approval-checks";
import { canTransition, type Actor } from "@/lib/job-workflow";
import { approveJobCore } from "@/lib/job-approval";
import type { JobStatus } from "@/lib/jobs";
import { getAutomationSettings } from "@/lib/settings";

const SYSTEM_ACTOR: Actor = { type: "system", id: 0, name: "JDL Core" };

/**
 * Approves jobs that have earned it. It does nothing unless the mode is "auto", and a job is only
 * approved when ALL of these hold:
 *   - the checks recorded at submission said pass, and the job has waited out the hold window
 *     (so staff have had a chance to look first);
 *   - the checks are re-run right now and still all pass (nothing changed since);
 *   - it is still awaiting approval (a person may have handled it meanwhile).
 * It can only approve, never reject: anything doubtful stays in the queue for a person. Every
 * automatic approval is written to the job's timeline with the checks that passed.
 * Because the schedule is daily, the hold is "at least N hours, then the next run".
 */
export async function runAutoApprove() {
  const settings = await getAutomationSettings();
  if (settings.approvalMode !== "auto") return { mode: settings.approvalMode, approved: 0, held: 0, skipped: 0 };

  const database = requireDb();
  const holdHours = Math.max(0, Number(settings.approvalHoldHours) || 0);
  const cutoff = new Date(Date.now() - holdHours * 60 * 60 * 1000);

  const waiting = await database.select({ id: jobs.id, status: jobs.status }).from(jobs).where(eq(jobs.status, "awaiting_approval"));
  let approved = 0;
  let held = 0;
  let skipped = 0;

  for (const job of waiting) {
    if (!canTransition(job.status as JobStatus, "approved", SYSTEM_ACTOR)) {
      skipped += 1;
      continue;
    }
    const latest = await database
      .select()
      .from(jobApprovalChecks)
      .where(eq(jobApprovalChecks.jobId, job.id))
      .orderBy(desc(jobApprovalChecks.submittedAt))
      .limit(1);
    const row = latest[0];
    if (!row || row.verdict !== "pass" || row.humanDecision) {
      skipped += 1;
      continue;
    }
    if (row.createdAt > cutoff) {
      held += 1; // still inside the hold window
      continue;
    }

    const now = await evaluateApproval(job.id);
    if (now.verdict !== "pass") {
      skipped += 1;
      continue;
    }

    const note = `Auto-approved: all ${now.checks.length} checks passed (${now.checks.map((c) => c.label.toLowerCase()).join("; ")}).`;
    const result = await approveJobCore({ jobId: job.id, actor: { type: "system", id: null, name: "JDL Core (automatic)" }, note });
    if (!result.ok) {
      skipped += 1;
      continue;
    }
    await recordApprovalDecision(job.id, "auto_approved");
    approved += 1;
  }

  return { mode: "auto", approved, held, skipped };
}
