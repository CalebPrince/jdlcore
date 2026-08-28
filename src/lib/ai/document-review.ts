import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { requireDb } from "@/db";
import { aiReviews } from "@/db/schema";
import { runCompletion, AiUnavailableError, type Attachment } from "./gateway";
import { notifyStaffBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";

export type Severity = "none" | "low" | "medium" | "high";
export type ReviewTargetType = "completion_data" | "document" | "receipt";

export type ReviewResult = {
  severity: Severity;
  summary: string;
};

const OPS_ROLES = ["operations", "administrator", "superadmin"] as const;

const SYSTEM_PROMPT = `You are a quality-control assistant for JDL Core Inspection Services, an independent stock/quantity inspection company. You review submitted inspection data, uploaded documents, and payment receipts for anything that looks off — inconsistent numbers, a receipt that doesn't match an invoice, a document that looks incomplete, altered, or unrelated to an inspection. You never make the final call — a human at JDL Core always decides. You are conservative: only flag something above "none" if there is a genuine, explainable reason a human should take a second look. Respond with ONLY a JSON object, no other text: {"severity": "none"|"low"|"medium"|"high", "summary": "one or two sentences explaining what you found, or empty string if severity is none"}.`;

function parseReviewResponse(text: string): ReviewResult {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : text) as { severity?: string; summary?: string };
    const severity: Severity = ["none", "low", "medium", "high"].includes(parsed.severity ?? "")
      ? (parsed.severity as Severity)
      : "none";
    return { severity, summary: (parsed.summary ?? "").trim().slice(0, 500) };
  } catch {
    return { severity: "none", summary: "" };
  }
}

async function persistAndNotify(
  jobId: number,
  jobRef: string,
  targetType: ReviewTargetType,
  targetId: number | null,
  result: ReviewResult,
  provider: string | null,
): Promise<void> {
  const database = requireDb();
  await database.insert(aiReviews).values({
    jobId,
    targetType,
    targetId,
    severity: result.severity,
    summary: result.summary,
    provider,
  });

  if (result.severity === "none") return;

  const labels: Record<ReviewTargetType, string> = {
    completion_data: "completion data",
    document: "an uploaded document",
    receipt: "a payment receipt",
  };
  const title = `AI flagged ${labels[targetType]} on ${jobRef}`;
  const body = result.summary || `Severity: ${result.severity}`;

  await notifyStaffBoth({
    roles: [...OPS_ROLES],
    type: "ai_review_flag",
    title,
    body,
    link: `/admin/jobs/${jobId}`,
    emailSubject: title,
    emailHtml: brandedEmailHtml({
      label: "JDL CORE ADMIN",
      heading: title,
      bodyLines: [body],
      ctaUrl: `https://jdlcore.com/admin/jobs/${jobId}`,
      ctaLabel: "Open Job",
    }),
  });
}

/** Best-effort — never throws. Failures are logged and silently skipped so the calling action always succeeds. */
async function safeRun(input: {
  jobId: number;
  jobRef: string;
  targetType: ReviewTargetType;
  targetId: number | null;
  prompt: string;
  attachment?: Attachment;
}): Promise<void> {
  try {
    const { text, provider } = await runCompletion({
      system: SYSTEM_PROMPT,
      turns: [{ role: "user", content: input.prompt }],
      maxTokens: 300,
      totalTimeoutMs: 25_000,
      attachment: input.attachment,
    });
    const result = parseReviewResponse(text);
    await persistAndNotify(input.jobId, input.jobRef, input.targetType, input.targetId, result, provider);
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) console.error("ai document-review:", err);
    // No providers configured, or all failed — this feature is best-effort by design.
  }
}

export async function reviewCompletionData(input: {
  jobId: number;
  jobRef: string;
  service: string;
  product: string | null;
  gov: string | null;
  gsv: string | null;
  metricTonnesAir: string | null;
  metricTonnesVacuum: string | null;
  inspectorComments: string | null;
  priorReadings: { gov: string | null; gsv: string | null; date: string }[];
}): Promise<void> {
  const priorLines = input.priorReadings.length
    ? input.priorReadings.map((r) => `- ${r.date}: GOV ${r.gov ?? "—"}, GSV ${r.gsv ?? "—"}`).join("\n")
    : "(no prior jobs for this client/product to compare against)";

  const prompt = `Review this inspection completion submission for anything that looks inconsistent or worth a second look.

Service: ${input.service}
Product: ${input.product ?? "—"}
GOV (Gross Observed Volume): ${input.gov ?? "—"}
GSV (Gross Standard Volume): ${input.gsv ?? "—"}
Metric Tonnes (Air): ${input.metricTonnesAir ?? "—"}
Metric Tonnes (Vacuum): ${input.metricTonnesVacuum ?? "—"}
Inspector's comments: ${input.inspectorComments || "(none provided)"}

Recent prior readings for this client/product, for context:
${priorLines}

Check for: numbers that don't reconcile with each other (e.g. Air/Vacuum tonnage far apart), a reading wildly out of line with the prior readings above, missing values that should be present, or inspector comments that contradict the numbers.`;

  await safeRun({ jobId: input.jobId, jobRef: input.jobRef, targetType: "completion_data", targetId: null, prompt });
}

export async function reviewUploadedFile(input: {
  jobId: number;
  jobRef: string;
  targetType: "document" | "receipt";
  targetId: number;
  fileDataUrl: string;
  context: string;
}): Promise<void> {
  const match = input.fileDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return;
  const mimeType = match[1];
  const base64 = match[2];
  const reviewable = mimeType.startsWith("image/") || mimeType === "application/pdf";
  if (!reviewable) return; // .doc/.docx and other non-visual formats aren't reviewed for now.

  const prompt =
    input.targetType === "receipt"
      ? `This is a payment receipt uploaded by a client against an invoice. ${input.context} Check whether the receipt looks genuine and consistent with the invoice (amount, that it looks like an actual payment confirmation, not blank/unrelated/altered). Flag anything that doesn't match up.`
      : `This is a document attached to an inspection job. ${input.context} Check whether it looks like a genuine, complete inspection-related document — not blank, unrelated to inspections, or obviously incomplete.`;

  await safeRun({
    jobId: input.jobId,
    jobRef: input.jobRef,
    targetType: input.targetType,
    targetId: input.targetId,
    prompt,
    attachment: { mimeType, base64 },
  });
}

export async function loadJobReviews(jobId: number) {
  const database = requireDb();
  return database
    .select()
    .from(aiReviews)
    .where(and(eq(aiReviews.jobId, jobId), ne(aiReviews.severity, "none")))
    .orderBy(aiReviews.createdAt);
}
