import "server-only";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, ne } from "drizzle-orm";
import { requireDb } from "@/db";
import { proposedActions, staff } from "@/db/schema";
import type { StaffRole } from "@/lib/staff-auth";
import type { Actor } from "@/lib/job-workflow";
import { approveJobCore, checkJobApprovable, loadJobForApproval, type JobApprovalResult } from "@/lib/job-actions";

const proposedByStaff = alias(staff, "proposed_by_staff");
const reviewedByStaff = alias(staff, "reviewed_by_staff");

/** Shared select shape for the admin queue view — the raw proposal plus the two staff names, resolved once here rather than in every caller. */
function proposalListQuery() {
  return requireDb()
    .select({
      id: proposedActions.id,
      actionType: proposedActions.actionType,
      targetType: proposedActions.targetType,
      targetId: proposedActions.targetId,
      summary: proposedActions.summary,
      status: proposedActions.status,
      reviewNote: proposedActions.reviewNote,
      executionResult: proposedActions.executionResult,
      createdAt: proposedActions.createdAt,
      reviewedAt: proposedActions.reviewedAt,
      proposedByName: proposedByStaff.name,
      reviewedByName: reviewedByStaff.name,
    })
    .from(proposedActions)
    .leftJoin(proposedByStaff, eq(proposedActions.proposedByStaffId, proposedByStaff.id))
    .leftJoin(reviewedByStaff, eq(proposedActions.reviewedByStaffId, reviewedByStaff.id));
}

export type StaffActor = { id: number; name: string; role: string };

/**
 * One entry per action type the reviewed-actions pipeline knows how to
 * propose and execute. Adding a new reviewable action (payment verification,
 * report issuance, an outbound message) means adding an entry here that
 * reuses its own existing business service — never new state-changing logic
 * written specifically for this pipeline.
 */
type ActionHandler = {
  requiredRoles: StaffRole[];
  /**
   * Re-verifies the target is still valid for this action RIGHT NOW — not
   * trusting the `proposedState` snapshot taken when the proposal was
   * created, since real time may have passed and someone else may have
   * already acted on the same target through the ordinary staff UI.
   */
  recheck: (payload: Record<string, unknown>) => Promise<{ ok: true; state: Record<string, unknown> } | { ok: false; message: string }>;
  execute: (payload: Record<string, unknown>, staff: StaffActor) => Promise<{ ok: boolean; message: string }>;
};

const OPS_ROLES: StaffRole[] = ["operations", "administrator", "superadmin"];

/** A role-neutral probe actor — canTransition's role check runs separately via requiredRoles above; this only exercises the state-based part of the rule. */
const PROBE_ACTOR: Actor = { type: "staff", id: 0, name: "", role: "operations" };

const HANDLERS: Record<string, ActionHandler> = {
  job_approval: {
    requiredRoles: OPS_ROLES,
    recheck: async (payload) => {
      const jobId = Number(payload.jobId);
      const job = await loadJobForApproval(jobId);
      if (!job) return { ok: false, message: "Job not found." };
      const check = checkJobApprovable(job, PROBE_ACTOR);
      if (!check.ok) return { ok: false, message: check.message };
      return { ok: true, state: { status: job.status, ref: job.ref } };
    },
    execute: async (payload, staff): Promise<JobApprovalResult> => approveJobCore(Number(payload.jobId), staff),
  },
};

export async function proposeJobApproval(input: {
  jobId: number;
  agentRunId?: number | null;
  proposedByStaffId?: number | null;
  reasoning?: string;
}): Promise<{ ok: boolean; proposalId?: number; message: string }> {
  const job = await loadJobForApproval(input.jobId);
  if (!job) return { ok: false, message: "Job not found." };
  const check = checkJobApprovable(job, PROBE_ACTOR);
  if (!check.ok) return { ok: false, message: check.message };

  const baseSummary = `Approve ${job.ref} for ${job.clientCompany ?? job.clientName} (${job.service}) — issues its Certificate of Quantity and invoice, and notifies the client.`;
  const summary = input.reasoning ? `${baseSummary} Reasoning: ${input.reasoning}` : baseSummary;

  const database = requireDb();
  const created = await database
    .insert(proposedActions)
    .values({
      actionType: "job_approval",
      targetType: "job",
      targetId: input.jobId,
      summary,
      payload: { jobId: input.jobId },
      proposedState: { status: job.status, ref: job.ref },
      agentRunId: input.agentRunId ?? null,
      proposedByStaffId: input.proposedByStaffId ?? null,
    })
    .returning({ id: proposedActions.id });
  return { ok: true, proposalId: created[0].id, message: `Proposal #${created[0].id} created — pending staff review: ${summary}` };
}

export async function listPendingProposals() {
  return proposalListQuery().where(eq(proposedActions.status, "pending")).orderBy(desc(proposedActions.createdAt));
}

export async function listRecentDecidedProposals(limit = 20) {
  return proposalListQuery().where(ne(proposedActions.status, "pending")).orderBy(desc(proposedActions.createdAt)).limit(limit);
}

async function loadProposal(proposalId: number) {
  const rows = await requireDb().select().from(proposedActions).where(eq(proposedActions.id, proposalId)).limit(1);
  return rows[0] ?? null;
}

/** Atomically moves a proposal from one status to another only if it is still in `from` — the guard that prevents duplicate execution on retries or a race between two reviewers. Returns false if the guard failed (someone else already moved it). */
async function claimTransition(
  proposalId: number,
  from: string,
  to: string,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const database = requireDb();
  const rows = await database
    .update(proposedActions)
    .set({ status: to, ...extra })
    .where(and(eq(proposedActions.id, proposalId), eq(proposedActions.status, from)))
    .returning({ id: proposedActions.id });
  return rows.length > 0;
}

export async function approveProposal(proposalId: number, staff: StaffActor): Promise<{ ok: boolean; message: string }> {
  const proposal = await loadProposal(proposalId);
  if (!proposal) return { ok: false, message: "Proposal not found." };
  if (proposal.status !== "pending") return { ok: false, message: `This proposal was already ${proposal.status}.` };

  const handler = HANDLERS[proposal.actionType];
  if (!handler) return { ok: false, message: `Unknown action type "${proposal.actionType}".` };

  // Recheck permission fresh, using this action type's own required roles — never trust that the proposal being visible implies the current reviewer may act on it.
  if (!handler.requiredRoles.includes(staff.role as StaffRole)) {
    return { ok: false, message: "You don't have permission to approve this type of action." };
  }

  // Recheck target state fresh, independent of the proposedState snapshot.
  const recheck = await handler.recheck(proposal.payload as Record<string, unknown>);
  if (!recheck.ok) {
    await claimTransition(proposalId, "pending", "stale", { reviewedByStaffId: staff.id, reviewedAt: new Date(), reviewNote: recheck.message });
    return { ok: false, message: `No longer valid: ${recheck.message} This proposal has been marked stale.` };
  }

  // Record state at approval time (independent of, and possibly different from, proposedState) and durably claim the decision before executing anything.
  const claimedApproval = await claimTransition(proposalId, "pending", "approved", {
    reviewedByStaffId: staff.id,
    reviewedAt: new Date(),
    approvedState: recheck.state,
  });
  if (!claimedApproval) return { ok: false, message: "Another staff member already decided this proposal." };

  // A second, independent guard against duplicate execution — even if this
  // function is somehow invoked twice concurrently for the same proposal
  // (a double-click, a retried request), only one caller can win this claim.
  const claimedExecution = await claimTransition(proposalId, "approved", "executing");
  if (!claimedExecution) return { ok: true, message: "This proposal is already being executed." };

  try {
    const result = await handler.execute(proposal.payload as Record<string, unknown>, staff);
    await claimTransition(proposalId, "executing", result.ok ? "executed" : "failed", {
      executionResult: result,
      executedAt: new Date(),
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await claimTransition(proposalId, "executing", "failed", { executionResult: { ok: false, message }, executedAt: new Date() });
    return { ok: false, message: `Execution failed: ${message}` };
  }
}

export async function rejectProposal(proposalId: number, staff: StaffActor, note: string): Promise<{ ok: boolean; message: string }> {
  if (!note.trim()) return { ok: false, message: "A rejection note is required." };
  const proposal = await loadProposal(proposalId);
  if (!proposal) return { ok: false, message: "Proposal not found." };
  if (proposal.status !== "pending") return { ok: false, message: `This proposal was already ${proposal.status}.` };

  const handler = HANDLERS[proposal.actionType];
  if (!handler) return { ok: false, message: `Unknown action type "${proposal.actionType}".` };
  if (!handler.requiredRoles.includes(staff.role as StaffRole)) {
    return { ok: false, message: "You don't have permission to decide this type of action." };
  }

  const claimed = await claimTransition(proposalId, "pending", "rejected", {
    reviewedByStaffId: staff.id,
    reviewedAt: new Date(),
    reviewNote: note.trim(),
  });
  if (!claimed) return { ok: false, message: "Another staff member already decided this proposal." };
  return { ok: true, message: "Proposal rejected." };
}
