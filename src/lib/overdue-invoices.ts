import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, invoices, jobs } from "@/db/schema";
import { notifyBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";

/**
 * No cron/queue infra in this project — call this from a jobs-list loader to
 * opportunistically flag invoices that just became overdue. overdueNotifiedAt
 * dedupes so a given invoice is only notified once.
 */
export async function flagOverdueInvoices(): Promise<void> {
  try {
    const database = requireDb();
    const overdue = await database
      .select({
        id: invoices.id,
        jobId: invoices.jobId,
        clientId: jobs.clientId,
        email: clients.email,
        ref: jobs.ref,
        number: invoices.number,
      })
      .from(invoices)
      .innerJoin(jobs, eq(invoices.jobId, jobs.id))
      .innerJoin(clients, eq(jobs.clientId, clients.id))
      .where(
        and(
          lt(invoices.dueDate, new Date()),
          or(
            eq(invoices.status, "pending"),
            eq(invoices.status, "payment_submitted"),
            eq(invoices.status, "payment_rejected"),
          ),
          isNull(invoices.overdueNotifiedAt),
        ),
      );

    for (const inv of overdue) {
      await database.update(invoices).set({ overdueNotifiedAt: new Date() }).where(eq(invoices.id, inv.id));
      const title = `Payment overdue — ${inv.number}`;
      const body = `Invoice ${inv.number} for job ${inv.ref} is now overdue.`;
      await notifyBoth({
        recipientType: "client",
        recipientId: inv.clientId,
        email: inv.email,
        jobId: inv.jobId,
        type: "payment_overdue",
        title,
        body,
        link: `/portal/jobs/${inv.jobId}`,
        emailSubject: title,
        emailHtml: brandedEmailHtml({
          label: "JDL CORE CLIENT PORTAL",
          heading: title,
          bodyLines: [body],
          ctaUrl: "https://jdlcore.com/portal",
          ctaLabel: "Open the portal",
          footer: `Job reference: ${inv.ref}`,
        }),
      });
    }
  } catch (err) {
    console.error("flagOverdueInvoices:", err);
  }
}
