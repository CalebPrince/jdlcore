import "server-only";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import {
  aiReviews,
  documents,
  jobApprovalChecks,
  jobCompletionData,
  jobUpdates,
  jobs,
  type ApprovalCheckItem,
} from "@/db/schema";
import { loadJobReviews } from "@/lib/ai/document-review";
import { getAutomationSettings } from "@/lib/settings";
import { checkReconcile, checkRequired } from "@/lib/approval-rules";

const DONE_STATUSES = ["approved", "report_issued", "invoice_issued", "paid", "closed"];

export type ApprovalEvaluation = {
  verdict: "pass" | "fail";
  checks: ApprovalCheckItem[];
  submittedAt: Date | null;
};

const num = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Runs the automatic checks on a submitted job. Deterministic rules plus the AI review's result.
 * A job "passes" only when every single check does. Nothing here changes any data.
 */
export async function evaluateApproval(jobId: number): Promise<ApprovalEvaluation> {
  const database = requireDb();
  const settings = await getAutomationSettings();
  const checks: ApprovalCheckItem[] = [];
  const add = (key: string, label: string, ok: boolean, detail: string) => checks.push({ key, label, ok, detail });

  const jobRows = await database.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = jobRows[0];
  if (!job) return { verdict: "fail", checks: [{ key: "job", label: "Job exists", ok: false, detail: "Job not found." }], submittedAt: null };

  const completionRows = await database.select().from(jobCompletionData).where(eq(jobCompletionData.jobId, jobId)).limit(1);
  const completion = completionRows[0];
  const submittedAt = completion?.submittedAt ?? null;
  add("completion", "Completion data submitted", !!completion && !!submittedAt, completion && submittedAt ? "Submitted by the inspector." : "No submitted completion data.");

  // Required figures and dates.
  const gov = num(completion?.gov);
  const gsv = num(completion?.gsv);
  const air = num(completion?.metricTonnesAir);
  const vacuum = num(completion?.metricTonnesVacuum);
  const started = completion?.dateTimeStarted ?? null;
  const finished = completion?.dateTimeCompleted ?? null;
  const figures = { gov, gsv, air, vacuum, started, finished };
  const required = checkRequired(figures);
  add("required_fields", "All required figures entered", required.ok, required.detail);
  const reconcile = checkReconcile(figures);
  add("numbers_reconcile", "Figures agree with each other", reconcile.ok, reconcile.detail);

  // Never auto-approve a resubmission: a person already had concerns about this job.
  const amendments = await database
    .select({ id: jobUpdates.id })
    .from(jobUpdates)
    .where(and(eq(jobUpdates.jobId, jobId), eq(jobUpdates.status, "rejected_amendment")))
    .limit(1);
  add("first_submission", "First submission (not an amended resubmission)", amendments.length === 0, amendments.length === 0 ? "This job has not been sent back before." : "It was sent back for changes before, so a person should review it.");

  // AI review: it must have actually run on this submission, and nothing flagged anywhere on the job.
  const completionReviews = submittedAt
    ? await database
        .select({ severity: aiReviews.severity, createdAt: aiReviews.createdAt })
        .from(aiReviews)
        .where(and(eq(aiReviews.jobId, jobId), eq(aiReviews.targetType, "completion_data")))
        .orderBy(desc(aiReviews.createdAt))
        .limit(1)
    : [];
  // A few minutes of tolerance: the review is stamped by the database clock, the submission by the app's.
  const CLOCK_SKEW_MS = 5 * 60 * 1000;
  const reviewRan = !!completionReviews[0] && completionReviews[0].createdAt.getTime() >= submittedAt!.getTime() - CLOCK_SKEW_MS;
  add("ai_review_ran", "AI quality review completed", reviewRan, reviewRan ? "The review ran on this submission." : "No completed AI review for this submission (it may be off or unavailable).");
  const flags = await loadJobReviews(jobId);
  add("no_ai_flags", "Nothing flagged by the AI review", flags.length === 0, flags.length === 0 ? "No issues raised on the data or any document." : `${flags.length} issue(s) flagged; see the banner above.`);

  const reports = await database
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.jobId, jobId), eq(documents.kind, "report")))
    .limit(1);
  const reportRequired = settings.approvalRequireReport !== "0";
  add(
    "report_attached",
    "Inspection report attached",
    !reportRequired || reports.length > 0,
    reports.length > 0 ? "A report document is attached." : reportRequired ? "No report document has been uploaded." : "Not required by your settings.",
  );

  // Inspector track record: their last N approved jobs went through without ever being sent back.
  const minClean = Math.max(1, Number(settings.approvalMinCleanJobs) || 5);
  if (!job.assignedInspectorId) {
    add("inspector_record", "Inspector track record", false, "No inspector is assigned.");
  } else {
    const prior = await database
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.assignedInspectorId, job.assignedInspectorId), ne(jobs.id, jobId), inArray(jobs.status, DONE_STATUSES)))
      .orderBy(sql`${jobs.approvedAt} desc nulls last`)
      .limit(minClean);
    let sentBack = 0;
    if (prior.length > 0) {
      const rows = await database
        .select({ jobId: jobUpdates.jobId })
        .from(jobUpdates)
        .where(and(inArray(jobUpdates.jobId, prior.map((p) => p.id)), eq(jobUpdates.status, "rejected_amendment")));
      sentBack = new Set(rows.map((r) => r.jobId)).size;
    }
    const ok = prior.length >= minClean && sentBack === 0;
    add(
      "inspector_record",
      `Inspector's last ${minClean} approved jobs had no amendments`,
      ok,
      prior.length < minClean
        ? `Only ${prior.length} of ${minClean} approved jobs so far.`
        : sentBack > 0
          ? `${sentBack} of their last ${minClean} jobs was sent back for changes.`
          : `Last ${minClean} approved jobs all went through first time.`,
    );
  }

  const allowed = settings.approvalServiceTypes.split(",").map((s) => s.trim()).filter(Boolean);
  const serviceOk = !!job.serviceType && allowed.includes(job.serviceType);
  add("service_allowed", "Service type allowed for automatic approval", serviceOk, serviceOk ? "This service is on the allowed list." : "This service is not on the automatic-approval list.");

  return { verdict: checks.every((c) => c.ok) ? "pass" : "fail", checks, submittedAt };
}

/**
 * Called right after an inspector submits (or resubmits) a job. When the approval automation is on,
 * evaluates the job and records the verdict, so shadow mode can later be compared with what the
 * human decided. Best-effort and never throws.
 */
export async function recordApprovalCheck(jobId: number): Promise<void> {
  try {
    const settings = await getAutomationSettings();
    if (settings.approvalMode === "off") return;
    const evaluation = await evaluateApproval(jobId);
    if (!evaluation.submittedAt) return;
    await requireDb()
      .insert(jobApprovalChecks)
      .values({
        jobId,
        submittedAt: evaluation.submittedAt,
        mode: settings.approvalMode,
        verdict: evaluation.verdict,
        checks: evaluation.checks,
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("recordApprovalCheck:", err);
  }
}

/** Notes what the human (or the automation) decided on the latest recorded check for a job. */
export async function recordApprovalDecision(jobId: number, decision: "approved" | "rejected" | "auto_approved"): Promise<void> {
  try {
    const database = requireDb();
    const latest = await database
      .select({ id: jobApprovalChecks.id, humanDecision: jobApprovalChecks.humanDecision })
      .from(jobApprovalChecks)
      .where(eq(jobApprovalChecks.jobId, jobId))
      .orderBy(desc(jobApprovalChecks.submittedAt))
      .limit(1);
    if (!latest[0] || latest[0].humanDecision) return;
    await database
      .update(jobApprovalChecks)
      .set({ humanDecision: decision, decidedAt: new Date() })
      .where(eq(jobApprovalChecks.id, latest[0].id));
  } catch (err) {
    console.error("recordApprovalDecision:", err);
  }
}

export type ApprovalStats = {
  decided: number;
  /** Checks said pass and a person approved: automation would have been right. */
  agreedPass: number;
  /** Checks said pass but a person sent it back: the dangerous kind of disagreement. */
  passButRejected: number;
  /** Checks said fail but a person approved it anyway: automation was stricter than needed. */
  failButApproved: number;
};

/** How the automatic verdict compares to human decisions over the last `days` days. */
export async function approvalStats(days = 60): Promise<ApprovalStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await requireDb()
    .select({ verdict: jobApprovalChecks.verdict, decision: jobApprovalChecks.humanDecision })
    .from(jobApprovalChecks)
    // gte() (not a raw sql fragment): the production driver cannot bind a Date inside a raw fragment.
    .where(and(inArray(jobApprovalChecks.humanDecision, ["approved", "rejected"]), gte(jobApprovalChecks.decidedAt, since)));
  return {
    decided: rows.length,
    agreedPass: rows.filter((r) => r.verdict === "pass" && r.decision === "approved").length,
    passButRejected: rows.filter((r) => r.verdict === "pass" && r.decision === "rejected").length,
    failButApproved: rows.filter((r) => r.verdict === "fail" && r.decision === "approved").length,
  };
}
