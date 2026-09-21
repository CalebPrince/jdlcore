import "server-only";
import { eq, or } from "drizzle-orm";
import { requireDb } from "@/db";
import { invoices, jobUpdates, jobs, services } from "@/db/schema";
import { getInvoiceSettings } from "@/lib/settings";
import { issueInvoice } from "@/lib/invoicing";

export type AutoInvoiceResult =
  | { outcome: "issued"; number: string }
  | { outcome: "disabled" | "exists" | "no_price" | "error" };

/**
 * Called right after a job is approved. When "issue automatically" is switched on in
 * Admin > Settings, drafts and issues the invoice from the service's default price so
 * Operations doesn't have to. Never throws: on any problem the job simply stays for
 * manual invoicing (and surfaces in the daily digest as "approved, no invoice yet").
 * Payment verification is untouched; that stays a manual staff decision.
 */
export async function maybeAutoIssueInvoice(jobId: number): Promise<AutoInvoiceResult> {
  try {
    const invoiceSettings = await getInvoiceSettings();
    if (invoiceSettings.autoIssue !== "1") return { outcome: "disabled" };

    const database = requireDb();
    const existing = await database
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.jobId, jobId))
      .limit(1);
    if (existing[0]) return { outcome: "exists" };

    const jobRows = await database.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    const job = jobRows[0];
    if (!job) return { outcome: "error" };

    const match = job.serviceType
      ? or(eq(services.key, job.serviceType), eq(services.label, job.service))
      : eq(services.label, job.service);
    const serviceRows = await database
      .select({ key: services.key, defaultPriceCents: services.defaultPriceCents })
      .from(services)
      .where(match);
    // Prefer the exact key match when both a key and a label matched different rows.
    const service = serviceRows.find((s) => s.key === job.serviceType) ?? serviceRows[0];
    if (!service?.defaultPriceCents || service.defaultPriceCents <= 0) return { outcome: "no_price" };

    const termsDays = Number(invoiceSettings.termsDays) || 14;
    const due = new Date();
    due.setDate(due.getDate() + termsDays);
    const currency = invoiceSettings.defaultCurrency === "USD" ? "USD" : "GHS";

    const issued = await issueInvoice({
      jobId,
      subtotalCents: service.defaultPriceCents,
      currency,
      dueDate: due.toISOString().slice(0, 10),
    });

    await database.insert(jobUpdates).values({
      jobId,
      status: "invoice_issued",
      note: `Invoice ${issued.number} issued automatically from the service default price.`,
      actorType: "system",
      actorId: null,
      actorName: "JDL Core",
    });
    return { outcome: "issued", number: issued.number };
  } catch (err) {
    console.error("maybeAutoIssueInvoice:", err);
    return { outcome: "error" };
  }
}
