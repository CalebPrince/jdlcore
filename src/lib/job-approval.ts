import "server-only";
import { and, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { invoices, jobUpdates, jobs } from "@/db/schema";
import { generateCoq } from "@/lib/coq";
import { maybeAutoIssueInvoice, type AutoInvoiceResult } from "@/lib/automation/auto-invoice";

export type ApprovalActor = { type: "staff" | "system"; id: number | null; name: string };

/**
 * The one place a job is approved: moves it through approved to report issued and issues the
 * Certificate of Quantity. It stops there. The job only becomes "invoice issued" when an invoice
 * really exists, which is when Operations issues one from the job page (or, if that setting is
 * switched on, when the automatic invoice below is issued). Shared by the staff Approve button and
 * by guarded auto-approval so a certificate is produced identically either way. The update is
 * guarded on the job still awaiting approval, so a person and the automation can't both approve
 * the same job.
 */
export async function approveJobCore(input: {
  jobId: number;
  actor: ApprovalActor;
  note?: string;
}): Promise<{ ok: true; invoice: AutoInvoiceResult } | { ok: false; reason: string }> {
  const database = requireDb();
  const now = new Date();
  const updated = await database
    .update(jobs)
    .set({ status: "approved", approvedAt: now, approvedByStaffId: input.actor.type === "staff" ? input.actor.id : null, updatedAt: now })
    .where(and(eq(jobs.id, input.jobId), eq(jobs.status, "awaiting_approval")))
    .returning({ id: jobs.id });
  if (updated.length === 0) return { ok: false, reason: "This job isn't awaiting approval." };

  for (const status of ["approved", "report_issued"] as const) {
    await database.insert(jobUpdates).values({
      jobId: input.jobId,
      status,
      note: status === "approved" ? (input.note ?? `Approved by ${input.actor.name}.`) : null,
      actorType: status === "approved" ? input.actor.type : "system",
      actorId: status === "approved" ? input.actor.id : null,
      actorName: status === "approved" ? input.actor.name : "JDL Core",
    });
  }
  // A job approved again after an amendment may already have its invoice, so it goes straight back
  // to "invoice issued" rather than asking Operations for a second one.
  const invoiced = await database.select({ id: invoices.id }).from(invoices).where(eq(invoices.jobId, input.jobId)).limit(1);
  await database
    .update(jobs)
    .set({ status: invoiced[0] ? "invoice_issued" : "report_issued", updatedAt: new Date() })
    .where(eq(jobs.id, input.jobId));

  await generateCoq(input.jobId, input.actor.type === "staff" ? input.actor.id : null);
  const invoice = await maybeAutoIssueInvoice(input.jobId);
  return { ok: true, invoice };
}
