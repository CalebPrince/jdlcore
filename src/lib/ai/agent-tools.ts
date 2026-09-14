import "server-only";
import type { ToolCall, ToolDefinition } from "./gateway";
import {
  searchJobs,
  searchReferenceDocuments,
  searchReviewFlags,
  searchStockReadings,
  type EvidenceItem,
  type ReviewSeverity,
  type StaffActor,
} from "./admin-assistant-tools";
import { findJobIdByRef } from "@/lib/job-actions";
import { proposeJobApproval } from "@/lib/reviewed-actions";

/**
 * Read-only lookups from roadmap step 3 (src/lib/ai/admin-assistant-tools.ts),
 * plus one write-adjacent tool from step 5: propose_job_approval. That tool
 * never changes anything itself — it only creates a durable, human-reviewable
 * proposal (src/lib/reviewed-actions.ts); a staff member must approve it
 * before src/lib/job-actions.ts's approveJobCore ever runs. Every read tool
 * still runs through the same independently access-checked functions, so
 * nothing about the access model changes by letting the model choose when to
 * call them instead of keyword routing.
 */
export const ADMIN_AGENT_TOOLS: ToolDefinition[] = [
  {
    name: "search_jobs",
    description: "Search inspection jobs by reference (e.g. JDL-2026-0042), client name, location, or product.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Job reference, client name, location, or product to search for." } },
      required: ["query"],
    },
  },
  {
    name: "search_review_flags",
    description: "Search AI quality-review flags (only severities above 'none' are ever returned). Optionally filter by job reference and/or severity.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "A job reference or client name to narrow the search, if known." },
        severity: { type: "string", enum: ["low", "medium", "high"], description: "Only return flags of this severity." },
      },
    },
  },
  {
    name: "search_stock_readings",
    description: "Search recent tank-gauge stock readings by tank name, product, client, or job reference.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Tank name, product, client name, or job reference." } },
      required: ["query"],
    },
  },
  {
    name: "search_reference_documents",
    description: "Search reference documents (global and client-scoped) for excerpts relevant to a topic.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Topic or keywords to search for." } },
      required: ["query"],
    },
  },
  {
    name: "propose_job_approval",
    description:
      "Propose approving an inspection job that is awaiting approval. This does NOT approve the job — it only creates a durable proposal that a human staff member must review and approve before anything changes (which then issues the Certificate of Quantity and invoice, and notifies the client). Only propose this when search_jobs shows the job's status is awaiting approval and search_review_flags shows no unresolved flag against it.",
    parameters: {
      type: "object",
      properties: {
        jobRef: { type: "string", description: "The job reference shown in evidence, e.g. JDL-2026-0042." },
        reasoning: { type: "string", description: "A short explanation for the human reviewer of why this job should be approved." },
      },
      required: ["jobRef", "reasoning"],
    },
  },
];

function isSeverity(value: unknown): value is ReviewSeverity {
  return value === "low" || value === "medium" || value === "high";
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : "";
}

export type ProposalOutcome = { proposalId?: number; message: string };

/**
 * Dispatches one tool call to its scoped read function, or to the one
 * write-adjacent tool (propose_job_approval). Read tools return the raw
 * evidence items only — no [Ref n] numbers are assigned here, because a run
 * can call multiple tools across multiple steps and ref numbers must stay
 * unique across the whole run, not reset per call; the agent runner assigns
 * global ref numbers as results come in (see runBoundedAgent). `runId` links
 * a proposal back to the run that made it, once the runner has one to give.
 */
export async function executeAdminAgentTool(
  staff: StaffActor,
  call: ToolCall,
  runId?: number,
): Promise<EvidenceItem[] | ProposalOutcome | { error: string }> {
  switch (call.name) {
    case "search_jobs":
      return searchJobs(staff, stringArg(call.arguments, "query"));
    case "search_review_flags":
      return searchReviewFlags(staff, {
        term: stringArg(call.arguments, "query") || undefined,
        severity: isSeverity(call.arguments.severity) ? call.arguments.severity : null,
      });
    case "search_stock_readings":
      return searchStockReadings(staff, stringArg(call.arguments, "query"));
    case "search_reference_documents":
      return searchReferenceDocuments(staff, stringArg(call.arguments, "query"));
    case "propose_job_approval": {
      const ref = stringArg(call.arguments, "jobRef");
      const reasoning = stringArg(call.arguments, "reasoning");
      if (!ref) return { error: "jobRef is required." };
      const jobId = await findJobIdByRef(ref);
      if (!jobId) return { error: `No job found with reference "${ref}".` };
      const outcome = await proposeJobApproval({ jobId, agentRunId: runId ?? null, proposedByStaffId: staff.id, reasoning });
      return outcome.ok ? { proposalId: outcome.proposalId, message: outcome.message } : { error: outcome.message };
    }
    default:
      return { error: `Unknown tool "${call.name}".` };
  }
}
