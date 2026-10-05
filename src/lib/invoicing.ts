import "server-only";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, invoices, jobUpdates, jobs } from "@/db/schema";
import { makeInvoiceNumber } from "@/lib/jobs";
import { computeInvoiceTotal } from "@/lib/invoice-tax";
import { getInvoiceSettings } from "@/lib/settings";
import { notifyBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";
import { getPaystackConfig, isPaystackReady } from "@/lib/paystack";

export async function payOnlineLine(): Promise<string> {
  const ready = isPaystackReady(await getPaystackConfig());
  return ready ? "You can also pay this invoice online instantly by card or mobile money from the portal." : "";
}

export type IssuedInvoice = { invoiceId: number; number: string; amountCents: number; currency: string };

/** Job statuses an invoice moves on to "invoice issued". Earlier or later ones are left as they are. */
const AWAITING_INVOICE_STATUSES = ["approved", "report_issued"];

/**
 * Creates an invoice for a job, moves an approved job on to "invoice issued", records it on the
 * job timeline and notifies the client. Shared by the manual "Issue invoice" form and the
 * auto-invoice-on-approval path so numbering, tax breakdown, status and the client email stay
 * identical. `subtotalCents` is the pre-levy amount; the GHS levies are added by
 * computeInvoiceTotal. Throws on a database failure.
 */
export async function issueInvoice(input: {
  jobId: number;
  subtotalCents: number;
  currency: "GHS" | "USD";
  dueDate: string | null; // YYYY-MM-DD
  actor: { type: "staff" | "system"; id: number | null; name: string };
  /** Timeline note; defaults to "Invoice <number> issued by <actor>." */
  note?: (number: string) => string;
}): Promise<IssuedInvoice> {
  const database = requireDb();
  const breakdown = computeInvoiceTotal(input.subtotalCents, input.currency);
  const amountCents = breakdown?.totalCents ?? input.subtotalCents;

  const inserted = await database
    .insert(invoices)
    .values({
      number: `PENDING-${Date.now()}`,
      jobId: input.jobId,
      amountCents,
      subtotalCents: breakdown?.subtotalCents ?? null,
      nhilCents: breakdown?.nhilCents ?? null,
      getfundCents: breakdown?.getfundCents ?? null,
      vatCents: breakdown?.vatCents ?? null,
      currency: input.currency,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: "pending",
    })
    .returning({ id: invoices.id });
  const invoiceId = inserted[0].id;
  const invoiceSettings = await getInvoiceSettings();
  const number = makeInvoiceNumber(invoiceId, invoiceSettings.invoicePrefix);
  await database.update(invoices).set({ number }).where(eq(invoices.id, invoiceId));

  const jobRows = await database.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
  const currentStatus = jobRows[0]?.status;
  if (currentStatus) {
    const advances = AWAITING_INVOICE_STATUSES.includes(currentStatus);
    if (advances) {
      await database.update(jobs).set({ status: "invoice_issued", updatedAt: new Date() }).where(eq(jobs.id, input.jobId));
    }
    await database.insert(jobUpdates).values({
      jobId: input.jobId,
      status: advances ? "invoice_issued" : currentStatus,
      note: input.note ? input.note(number) : `Invoice ${number} issued by ${input.actor.name}.`,
      actorType: input.actor.type,
      actorId: input.actor.id,
      actorName: input.actor.name,
    });
  }

  const rows = await database
    .select({ clientId: clients.id, email: clients.email, ref: jobs.ref })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(jobs.id, input.jobId))
    .limit(1);
  const recipient = rows[0];
  if (recipient) {
    const amountStr = `${input.currency} ${(amountCents / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient.clientId,
      email: recipient.email,
      jobId: input.jobId,
      type: "invoice_created",
      title: `Invoice ${number} issued on job ${recipient.ref}`,
      body: `Amount due: ${amountStr}`,
      link: `/portal/jobs/${input.jobId}`,
      emailSubject: `[${recipient.ref}] New invoice - JDL Core`,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE CLIENT PORTAL",
        heading: `Invoice ${number} has been issued`,
        bodyLines: [
          `Amount due: <strong>${amountStr}</strong>`,
          input.dueDate ? `Payment is due by ${input.dueDate}.` : "",
          "Download the PDF invoice from the portal.",
          await payOnlineLine(),
        ].filter(Boolean),
        ctaUrl: "https://jdlcore.com/portal",
        ctaLabel: "Open the portal",
        footer: `Job reference: ${recipient.ref}`,
      }),
    });
  }

  return { invoiceId, number, amountCents, currency: input.currency };
}
