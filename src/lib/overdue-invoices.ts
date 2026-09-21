import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, invoices, jobs } from "@/db/schema";
import { notifyBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";
import { getPaystackConfig, isPaystackReady } from "@/lib/paystack";

/**
 * Flags invoices that just became overdue and notifies the client once (overdueNotifiedAt
 * dedupes). The daily cron (src/lib/automation/invoice-reminders.ts) is the primary
 * caller; the jobs-list and portal loaders still call it as a fallback so a missed cron
 * run doesn't leave an overdue invoice unflagged. Returns how many invoices were flagged.
 */
export async function flagOverdueInvoices(): Promise<number> {
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

    if (overdue.length === 0) return 0;
    const payOnline = isPaystackReady(await getPaystackConfig())
      ? "You can also pay this invoice online instantly by card or mobile money from the portal."
      : null;

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
          bodyLines: [body, payOnline].filter((l): l is string => Boolean(l)),
          ctaUrl: "https://jdlcore.com/portal",
          ctaLabel: "Open the portal",
          footer: `Job reference: ${inv.ref}`,
        }),
      });
    }
    return overdue.length;
  } catch (err) {
    console.error("flagOverdueInvoices:", err);
    return 0;
  }
}
