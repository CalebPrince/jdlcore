import "server-only";
import { and, desc, eq, ilike, ne, or } from "drizzle-orm";
import { requireDb } from "@/db";
import {
  aiReviews,
  clients,
  inspectors,
  jobs,
  knowledgeDocumentChunks,
  knowledgeDocuments,
  stockReadings,
  tanks,
} from "@/db/schema";
import type { StaffRole } from "@/lib/staff-auth";
import { JOB_STATUS_META, type JobStatus } from "@/lib/jobs";

export type StaffActor = { id: number; role: string };

const STAFF_ROLES: StaffRole[] = ["superadmin", "administrator", "operations"];

/**
 * Every read tool below calls this first. There is currently no role or
 * client partitioning on staff visibility of jobs/reviews/stock/documents in
 * the admin dashboard itself (any active staff member sees every job) — this
 * mirrors that, but keeps the check inline in each tool rather than only at
 * the page/route boundary, per the roadmap instruction to enforce identity
 * and access inside every tool, not just once at the top.
 */
function assertStaffAccess(staff: StaffActor): void {
  if (!staff?.id || !STAFF_ROLES.includes(staff.role as StaffRole)) {
    throw new Error("Unauthorized: caller is not an active staff member.");
  }
}

export type EvidenceKind = "job" | "review" | "stock_reading" | "document";

export type EvidenceItem = {
  kind: EvidenceKind;
  label: string;
  detail: string;
  link: string | null;
};

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function fmtDate(value: Date | string | null): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

/** Job reference format is `JDL-YYYY-NNNN` (see makeRef in src/lib/jobs.ts). */
const JOB_REF_PATTERN = /JDL-\d{4}-\d{3,6}/i;

export function extractJobRef(message: string): string | null {
  const match = message.match(JOB_REF_PATTERN);
  return match ? match[0].toUpperCase() : null;
}

const SEVERITIES = ["low", "medium", "high"] as const;
export type ReviewSeverity = (typeof SEVERITIES)[number];

export function extractSeverity(message: string): ReviewSeverity | null {
  const lower = message.toLowerCase();
  return SEVERITIES.find((s) => lower.includes(s)) ?? null;
}

function searchTerms(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
}

/** Jobs by reference, client name/company, location, product, or status label. */
export async function searchJobs(staff: StaffActor, term: string, limit = 6): Promise<EvidenceItem[]> {
  assertStaffAccess(staff);
  const database = requireDb();
  const ref = extractJobRef(term);
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const rows = await database
    .select({
      id: jobs.id,
      ref: jobs.ref,
      service: jobs.service,
      location: jobs.location,
      product: jobs.product,
      status: jobs.status,
      updatedAt: jobs.updatedAt,
      clientName: clients.name,
      clientCompany: clients.company,
      inspectorName: inspectors.name,
    })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .leftJoin(inspectors, eq(jobs.assignedInspectorId, inspectors.id))
    .where(
      ref
        ? eq(jobs.ref, ref)
        : or(
            ilike(jobs.ref, like),
            ilike(clients.name, like),
            ilike(clients.company, like),
            ilike(jobs.location, like),
            ilike(jobs.product, like),
          ),
    )
    .orderBy(desc(jobs.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    kind: "job",
    label: `${row.ref} — ${row.clientCompany ?? row.clientName}`,
    detail: [
      `Service: ${row.service}`,
      row.product ? `Product: ${row.product}` : null,
      row.location ? `Location: ${row.location}` : null,
      `Status: ${JOB_STATUS_META[row.status as JobStatus]?.label ?? row.status}`,
      row.inspectorName ? `Inspector: ${row.inspectorName}` : "Inspector: unassigned",
      `Last updated: ${fmtDate(row.updatedAt)}`,
    ]
      .filter(Boolean)
      .join(" · "),
    link: `/admin/jobs/${row.id}`,
  }));
}

/**
 * AI quality-review flags across jobs. A row with severity "none" means
 * either the review found nothing, or the model's response failed to parse —
 * those two cases are indistinguishable in storage today (see
 * src/lib/ai/document-review.ts parseReviewResponse), so this tool only
 * surfaces severities above "none" and never claims "all clear" from a
 * "none" row.
 */
export async function searchReviewFlags(
  staff: StaffActor,
  opts: { term?: string; severity?: ReviewSeverity | null },
  limit = 6,
): Promise<EvidenceItem[]> {
  assertStaffAccess(staff);
  const database = requireDb();
  const like = opts.term ? `%${opts.term.replace(/[%_]/g, "")}%` : null;
  const ref = opts.term ? extractJobRef(opts.term) : null;
  const rows = await database
    .select({
      id: aiReviews.id,
      jobId: aiReviews.jobId,
      jobRef: jobs.ref,
      clientName: clients.name,
      clientCompany: clients.company,
      targetType: aiReviews.targetType,
      severity: aiReviews.severity,
      summary: aiReviews.summary,
      createdAt: aiReviews.createdAt,
    })
    .from(aiReviews)
    .innerJoin(jobs, eq(aiReviews.jobId, jobs.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(
      and(
        ne(aiReviews.severity, "none"),
        opts.severity ? eq(aiReviews.severity, opts.severity) : undefined,
        ref
          ? eq(jobs.ref, ref)
          : like
            ? or(ilike(clients.name, like), ilike(clients.company, like))
            : undefined,
      ),
    )
    .orderBy(desc(aiReviews.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    kind: "review",
    label: `${row.severity.toUpperCase()} flag on ${row.jobRef} (${row.targetType.replace("_", " ")})`,
    detail: `${row.summary || "No summary recorded."} · ${row.clientCompany ?? row.clientName} · Flagged ${fmtDate(row.createdAt)}`,
    link: `/admin/jobs/${row.jobId}`,
  }));
}

/** Recent tank-gauge stock readings, matched by job ref, tank name, client, or product. */
export async function searchStockReadings(staff: StaffActor, term: string, limit = 6): Promise<EvidenceItem[]> {
  assertStaffAccess(staff);
  const database = requireDb();
  const ref = extractJobRef(term);
  const like = `%${term.replace(/[%_]/g, "")}%`;
  const rows = await database
    .select({
      id: stockReadings.id,
      jobId: stockReadings.jobId,
      jobRef: jobs.ref,
      readingDate: stockReadings.readingDate,
      closingStock: stockReadings.closingStock,
      gov: stockReadings.gov,
      gsv: stockReadings.gsv,
      dipHeightMm: stockReadings.dipHeightMm,
      source: stockReadings.source,
      tankName: tanks.name,
      product: tanks.product,
      clientName: clients.name,
      clientCompany: clients.company,
    })
    .from(stockReadings)
    .innerJoin(tanks, eq(stockReadings.tankId, tanks.id))
    .innerJoin(jobs, eq(stockReadings.jobId, jobs.id))
    .innerJoin(clients, eq(tanks.clientId, clients.id))
    .where(
      ref
        ? eq(jobs.ref, ref)
        : or(
            ilike(tanks.name, like),
            ilike(tanks.product, like),
            ilike(clients.name, like),
            ilike(clients.company, like),
          ),
    )
    .orderBy(desc(stockReadings.readingDate))
    .limit(limit);

  return rows.map((row) => ({
    kind: "stock_reading",
    label: `${row.tankName} (${row.jobRef}) — ${fmtDate(row.readingDate)}`,
    detail: [
      row.product ? `Product: ${row.product}` : null,
      `Closing stock: ${row.closingStock ?? "—"}`,
      `GOV: ${row.gov ?? "—"}`,
      `GSV: ${row.gsv ?? "—"}`,
      row.dipHeightMm ? `Dip height: ${row.dipHeightMm}mm` : null,
      `Source: ${row.source}`,
      `Client: ${row.clientCompany ?? row.clientName}`,
    ]
      .filter(Boolean)
      .join(" · "),
    link: `/admin/jobs/${row.jobId}`,
  }));
}

/**
 * Reference document excerpts (the Analytics knowledge corpus). Unlike
 * retrieveKnowledge() in src/lib/analytics-knowledge.ts — which scopes a
 * subscriber to "global" docs plus their own client's — an admin is not a
 * subscriber of any one client, so this tool searches every "ready" document
 * regardless of scope or client, and names the client for client-scoped hits.
 */
export async function searchReferenceDocuments(staff: StaffActor, term: string, limit = 5): Promise<EvidenceItem[]> {
  assertStaffAccess(staff);
  const database = requireDb();
  const terms = searchTerms(term);
  if (terms.length === 0) return [];

  const rows = await database
    .select({
      docId: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      scope: knowledgeDocuments.scope,
      clientName: clients.name,
      clientCompany: clients.company,
      content: knowledgeDocumentChunks.content,
    })
    .from(knowledgeDocumentChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeDocumentChunks.documentId, knowledgeDocuments.id))
    .leftJoin(clients, eq(knowledgeDocuments.clientId, clients.id))
    .where(eq(knowledgeDocuments.status, "ready"))
    .limit(1000);

  return rows
    .map((row) => {
      const haystack = row.content.toLowerCase();
      const score = terms.reduce((sum, t) => sum + (haystack.includes(t) ? 1 : 0), 0);
      return { ...row, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => ({
      kind: "document" as const,
      label: row.scope === "client" ? `${row.title} (${row.clientCompany ?? row.clientName ?? "client"} document)` : `${row.title} (global reference)`,
      detail: row.content,
      link: null,
    }));
}

/** Trivial application-code arithmetic — never delegated to the model. */
export function daysSince(date: Date | string | null): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000));
}
