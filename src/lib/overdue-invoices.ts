import "server-only";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { requireDb } from "@/db";
import { invoices, jobs } from "@/db/schema";
import { notify } from "@/lib/notifications";

/**
 * No cron/queue infra in this project — call this from a jobs-list loader to
 * opportunistically flag invoices that just became overdue. overdueNotifiedAt
 * dedupes so a given invoice is only notified once.
 */
export async function flagOverdueInvoices(): Promise<void> {
  try {
    const database = requireDb();
    const overdue = await database
      .select({ id: invoices.id, jobId: invoices.jobId, clientId: jobs.clientId, ref: jobs.ref, number: invoices.number })
      .from(invoices)
      .innerJoin(jobs, eq(invoices.jobId, jobs.id))
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
      await notify({
        recipientType: "client",
        recipientId: inv.clientId,
        jobId: inv.jobId,
        type: "payment_overdue",
        title: `Payment overdue — ${inv.number}`,
        body: `Invoice ${inv.number} for job ${inv.ref} is now overdue.`,
        link: `/portal/jobs/${inv.jobId}`,
      });
    }
  } catch (err) {
    console.error("flagOverdueInvoices:", err);
  }
}
