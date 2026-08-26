import "server-only";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { certificates, clients, invoices, jobs, services } from "@/db/schema";
import { makeCoqNumber, makeInvoiceNumber } from "@/lib/jobs";
import { notify } from "@/lib/notifications";
import { sendNotification } from "@/lib/email";
import { getInvoiceSettings, getReportSettings } from "@/lib/settings";

/**
 * Runs when Operations approves a completed job (section 10 of the client's
 * requirements doc): issues the Certificate of Quantity, auto-generates the
 * invoice, and notifies the client of both plus the new invoice.
 */
export async function generateCoqAndInvoice(
  jobId: number,
  issuedByStaffId: number,
): Promise<{ certificateId: number; invoiceId: number; coqNumber: string; invoiceNumber: string }> {
  const database = requireDb();

  const jobRows = await database.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = jobRows[0];
  if (!job) throw new Error("Job not found");

  const [invoiceSettings, reportSettings] = await Promise.all([
    getInvoiceSettings(),
    getReportSettings(),
  ]);

  let defaultPriceCents: number | null = null;
  if (job.serviceType) {
    const svcRows = await database
      .select({ defaultPriceCents: services.defaultPriceCents })
      .from(services)
      .where(eq(services.key, job.serviceType))
      .limit(1);
    defaultPriceCents = svcRows[0]?.defaultPriceCents ?? null;
  }

  const [cert] = await database
    .insert(certificates)
    .values({
      coqNumber: `PENDING-${Date.now()}`,
      jobId,
      issuedByStaffId,
    })
    .returning({ id: certificates.id });
  const coqNumber = makeCoqNumber(cert.id, reportSettings.coqPrefix);
  await database.update(certificates).set({ coqNumber }).where(eq(certificates.id, cert.id));

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (Number(invoiceSettings.termsDays) || 14));

  const [inv] = await database
    .insert(invoices)
    .values({
      number: `PENDING-${Date.now()}`,
      jobId,
      amountCents: defaultPriceCents ?? 0,
      currency: invoiceSettings.defaultCurrency,
      dueDate,
      status: "pending",
    })
    .returning({ id: invoices.id });
  const invoiceNumber = makeInvoiceNumber(inv.id, invoiceSettings.invoicePrefix);
  await database.update(invoices).set({ number: invoiceNumber }).where(eq(invoices.id, inv.id));

  await notify({
    recipientType: "client",
    recipientId: job.clientId,
    jobId,
    type: "report_approved",
    title: `Report approved — ${job.ref}`,
    body: "Your inspection report has been approved and the Certificate of Quantity is ready.",
    link: `/portal/jobs/${jobId}`,
  });
  await notify({
    recipientType: "client",
    recipientId: job.clientId,
    jobId,
    type: "invoice_generated",
    title: `Invoice ${invoiceNumber} issued — ${job.ref}`,
    body: defaultPriceCents
      ? `An invoice has been issued for this job, due ${dueDate.toDateString()}.`
      : "An invoice has been issued for this job — amount to be confirmed by Operations.",
    link: `/portal/jobs/${jobId}`,
  });

  const clientRows = await database
    .select({ email: clients.email })
    .from(clients)
    .where(eq(clients.id, job.clientId))
    .limit(1);
  if (clientRows[0]) {
    await sendNotification({
      to: clientRows[0].email,
      subject: `[${job.ref}] Report approved & invoice issued - JDL Core`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2733">
        <div style="background:#081826;padding:18px 24px;border-radius:8px 8px 0 0">
        <strong style="color:#f6cf6e;font-size:15px;letter-spacing:1px">JDL CORE CLIENT PORTAL</strong>
        </div>
        <div style="border:1px solid #e5e2da;border-top:0;padding:24px;border-radius:0 0 8px 8px">
        <h2 style="margin:0 0 12px;font-size:17px">Job ${job.ref} approved</h2>
        <p style="margin:0 0 10px;font-size:14px;line-height:1.55">Your Certificate of Quantity (${coqNumber}) and invoice (${invoiceNumber}) are now available in the client portal.</p>
        <p style="margin:16px 0 0"><a href="https://jdlcore.com/portal" style="display:inline-block;background:#c98e12;color:#081826;font-weight:bold;font-size:13px;padding:10px 20px;border-radius:999px;text-decoration:none">Open the portal</a></p>
        <p style="margin:18px 0 0;font-size:11px;color:#98a2ad">Job reference: ${job.ref}</p>
        </div></div>`,
    });
  }

  return { certificateId: cert.id, invoiceId: inv.id, coqNumber, invoiceNumber };
}
