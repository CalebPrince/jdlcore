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

/**
 * The agent's only tools today are the same read-only lookups from roadmap
 * step 3 (src/lib/ai/admin-assistant-tools.ts) — this stays within "read
 * tools" the way the roadmap ordered it; write/reviewed actions are step 5,
 * not built yet. Each tool call still runs through the same independently
 * access-checked functions, so nothing about the access model changes by
 * letting the model choose when to call them instead of keyword routing.
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
];

function isSeverity(value: unknown): value is ReviewSeverity {
  return value === "low" || value === "medium" || value === "high";
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === "string" ? v : "";
}

/**
 * Dispatches one tool call to its scoped read function. Returns the raw
 * evidence items only — no [Ref n] numbers are assigned here, because a run
 * can call multiple tools across multiple steps and ref numbers must stay
 * unique across the whole run, not reset per call. The agent runner assigns
 * global ref numbers as results come in (see runBoundedAgent).
 */
export async function executeAdminAgentTool(staff: StaffActor, call: ToolCall): Promise<EvidenceItem[] | { error: string }> {
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
    default:
      return { error: `Unknown tool "${call.name}".` };
  }
}
