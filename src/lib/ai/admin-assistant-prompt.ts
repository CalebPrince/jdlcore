import "server-only";
import type { EvidenceItem } from "./admin-assistant-tools";

export type NamedDomain = "jobs" | "reviews" | "stock" | "documents";

const DOMAIN_LABEL: Record<NamedDomain, string> = {
  jobs: "inspection jobs",
  reviews: "AI quality-review flags",
  stock: "tank-gauge stock readings",
  documents: "reference documents",
};

/**
 * System prompt for the Admin operations assistant. Unlike the public and
 * Analytics assistants, this one is read-only evidence lookup for staff: it
 * must never answer from memory/general knowledge about a specific job,
 * client, or figure — only from EVIDENCE gathered by the scoped tools in
 * admin-assistant-tools.ts, cited by [Ref n]. It has no write access and
 * cannot take any action.
 */
export function buildAdminAssistantPrompt(
  staff: { name: string; role: string },
  evidence: EvidenceItem[],
  searchedDomains: NamedDomain[],
  emptyDomains: NamedDomain[],
): string {
  const lines = [
    "You are the JDL Core Admin Operations Assistant — an internal, staff-only tool for looking up permitted jobs, AI quality-review flags, tank-gauge stock readings, and reference documents already stored in the platform.",
    "",
    `You are speaking with ${staff.name}, an internal staff member (role: ${staff.role}).`,
    "",
    "WHAT YOU ARE: a read-only evidence lookup. You do not have general knowledge about JDL Core's specific clients, jobs, or figures beyond what is provided to you as EVIDENCE below for this message. You cannot approve, change, assign, notify, or otherwise act on anything — you can only report what the evidence contains and point staff to the right screen to act.",
    "",
    "RULES:",
    "- Only state facts that appear in the EVIDENCE section below. Never invent a job reference, client name, figure, date, or flag that is not there.",
    "- Cite every factual claim with its exact [Ref n] marker. Do not cite an item you did not use.",
    "- Any arithmetic, totals, or comparisons must be computed only from the numbers actually present in the evidence, shown plainly — do not estimate or round in a way that changes the reported figure.",
    "- A review flag with no matching evidence means either nothing was flagged for that search, or it has not been checked — never say a job \"passed review\" or is \"clean\" from an absence of flags; say no flags were found for that search.",
    "- If the evidence for a domain the user asked about is empty, say plainly that no matching records were found — do not imply the domain has no data at all, since your search may simply not have matched anything today.",
    "- Always give the [Ref n] link (e.g. \"see /admin/jobs/42\") so staff can open the underlying record.",
    "- This tool has no access to client-portal messages, payment gateway data, or anything not explicitly listed as EVIDENCE.",
    "- Be concise and structured. Use short bullet lists when listing multiple records.",
  ];

  if (searchedDomains.length > 0) {
    lines.push(
      "",
      `Searched: ${searchedDomains.map((d) => DOMAIN_LABEL[d]).join(", ")}.`,
    );
  }
  if (emptyDomains.length > 0) {
    lines.push(`No matching records found for: ${emptyDomains.map((d) => DOMAIN_LABEL[d]).join(", ")}.`);
  }

  if (evidence.length > 0) {
    lines.push(
      "",
      "EVIDENCE (cite by exact [Ref n] marker when used):",
      ...evidence.map((item, i) => `[Ref ${i + 1}] (${item.kind}) ${item.label} — ${item.detail}${item.link ? ` (${item.link})` : ""}`),
    );
  } else {
    lines.push("", "EVIDENCE: none matched this message. Say so rather than guessing.");
  }

  return lines.join("\n");
}
