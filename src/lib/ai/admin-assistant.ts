import "server-only";
import {
  extractJobRef,
  extractSeverity,
  searchJobs,
  searchReferenceDocuments,
  searchReviewFlags,
  searchStockReadings,
  type EvidenceItem,
  type StaffActor,
} from "./admin-assistant-tools";
import { buildAdminAssistantPrompt, type NamedDomain } from "./admin-assistant-prompt";

const DOMAIN_KEYWORDS: Record<NamedDomain, RegExp> = {
  jobs: /\b(job|jobs|inspection|assign|assigned|client|status|inspector)\b/i,
  reviews: /\b(review|flag|flagged|flags|severity|quality|discrepan|suspicious|inconsisten)\b/i,
  stock: /\b(stock|tank|gauge|dip|reading|readings|gsv|gov|depot|volume|density|vcf)\b/i,
  documents: /\b(document|documents|doc|policy|procedure|reference|manual|guideline)\b/i,
};

function detectDomains(message: string): NamedDomain[] {
  const hit = (Object.keys(DOMAIN_KEYWORDS) as NamedDomain[]).filter((d) => DOMAIN_KEYWORDS[d].test(message));
  // A bare job reference or nothing recognisable at all: still worth a jobs
  // lookup rather than returning no evidence whatsoever.
  if (hit.length === 0) return ["jobs"];
  return hit;
}

/**
 * Runs the scoped read tools for whichever domains the message seems to be
 * about, and returns both the flattened evidence list and which domains were
 * searched vs. came back empty, so the prompt can be honest about the
 * difference between "nothing found" and "didn't look."
 */
export async function gatherEvidence(
  staff: StaffActor,
  message: string,
): Promise<{ evidence: EvidenceItem[]; searchedDomains: NamedDomain[]; emptyDomains: NamedDomain[] }> {
  const domains = detectDomains(message);
  const jobRef = extractJobRef(message);
  const severity = extractSeverity(message);
  const term = jobRef ?? message;

  const results = await Promise.all(
    domains.map(async (domain): Promise<[NamedDomain, EvidenceItem[]]> => {
      switch (domain) {
        case "jobs":
          return [domain, await searchJobs(staff, term)];
        case "reviews":
          return [domain, await searchReviewFlags(staff, { term: jobRef ?? undefined, severity })];
        case "stock":
          return [domain, await searchStockReadings(staff, term)];
        case "documents":
          return [domain, await searchReferenceDocuments(staff, message)];
      }
    }),
  );

  const evidence = results.flatMap(([, items]) => items);
  const emptyDomains = results.filter(([, items]) => items.length === 0).map(([domain]) => domain);
  return { evidence, searchedDomains: domains, emptyDomains };
}

export async function buildAdminAssistantSystemPrompt(
  staff: { name: string; role: string } & StaffActor,
  message: string,
): Promise<{ system: string; evidence: EvidenceItem[] }> {
  const { evidence, searchedDomains, emptyDomains } = await gatherEvidence(staff, message);
  const system = buildAdminAssistantPrompt(staff, evidence, searchedDomains, emptyDomains);
  return { system, evidence };
}
