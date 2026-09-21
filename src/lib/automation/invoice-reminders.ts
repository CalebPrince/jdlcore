import "server-only";
import { and, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, invoices, jobs } from "@/db/schema";
import { notifyBoth, notifyStaffBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";
import { flagOverdueInvoices } from "@/lib/overdue-invoices";
import { payOnlineLine } from "@/lib/invoicing";
import { claimEvent } from "./events";

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 3;
/** Older than this and it's a collections matter for a person, not an automated nudge. */
const MAX_AUTO_OVERDUE_DAYS = 60;

type Stage = { kind: "invoice_overdue_14" | "invoice_overdue_7" | "invoice_due_soon"; test: (daysToDue: number) => boolean };

// Highest severity first: an invoice that has crossed several thresholds since the last
// run (or since this feature shipped) gets one message, for the most severe one.
const STAGES: Stage[] = [
  { kind: "invoice_overdue_14", test: (d) => d <= -14 },
  { kind: "invoice_overdue_7", test: (d) => d <= -7 },
  { kind: "invoice_due_soon", test: (d) => d > 0 && d <= DUE_SOON_DAYS },
];

const fmtDate = (d: Date) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);

/**
 * Daily invoice follow-up: due-soon heads-up, then reminders at 7 and 14 days overdue (the
 * 14-day stage also alerts Operations). The first overdue notice itself still comes from
 * flagOverdueInvoices. Only invoices the client still has to pay are chased: `pending` and
 * `payment_rejected`. A `payment_submitted` invoice is waiting on staff verification, which
 * stays manual, so the client isn't nagged for it (staff get a digest nudge instead).
 */
export async function runInvoiceReminders() {
  const overdueFlagged = await flagOverdueInvoices();
  const counts = { dueSoon: 0, overdue7: 0, overdue14: 0 };

  const database = requireDb();
  const now = Date.now();
  const rows = await database
    .select({
      id: invoices.id,
      number: invoices.number,
      dueDate: invoices.dueDate,
      amountCents: invoices.amountCents,
      currency: invoices.currency,
      jobId: invoices.jobId,
      jobRef: jobs.ref,
      clientId: clients.id,
      clientName: clients.name,
      email: clients.email,
    })
    .from(invoices)
    .innerJoin(jobs, eq(invoices.jobId, jobs.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(
      and(
        inArray(invoices.status, ["pending", "payment_rejected"]),
        isNotNull(invoices.dueDate),
        gt(invoices.dueDate, new Date(now - MAX_AUTO_OVERDUE_DAYS * DAY_MS)),
      ),
    );

  const payOnline = await payOnlineLine();

  for (const inv of rows) {
    const daysToDue = (inv.dueDate!.getTime() - now) / DAY_MS;
    const applicable = STAGES.filter((s) => s.test(daysToDue));
    if (applicable.length === 0) continue;

    // Claim every applicable stage so lower ones never fire later; send for the highest new one.
    let toSend: Stage | null = null;
    for (const stage of applicable) {
      if ((await claimEvent(stage.kind, String(inv.id))) && !toSend) toSend = stage;
    }
    if (!toSend) continue;

    const amount = `${inv.currency} ${(inv.amountCents / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
    const due = fmtDate(inv.dueDate!);
    const overdue = toSend.kind !== "invoice_due_soon";
    const daysOverdue = Math.max(1, Math.floor(-daysToDue));

    const title = overdue
      ? `Reminder: invoice ${inv.number} is ${daysOverdue} days overdue`
      : `Invoice ${inv.number} is due on ${due}`;
    const bodyLines = [
      `Amount due: <strong>${amount}</strong>`,
      overdue ? `This invoice was due on ${due}.` : `Payment is due by ${due}.`,
      "You can download the invoice PDF from the client portal.",
      payOnline,
    ].filter(Boolean);

    await notifyBoth({
      recipientType: "client",
      recipientId: inv.clientId,
      email: inv.email,
      jobId: inv.jobId,
      type: overdue ? "invoice_reminder" : "invoice_due_soon",
      title,
      body: `Amount due: ${amount}`,
      link: `/portal/jobs/${inv.jobId}`,
      emailSubject: `[${inv.jobRef}] ${overdue ? "Invoice reminder" : "Invoice due soon"} - JDL Core`,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE CLIENT PORTAL",
        heading: title,
        bodyLines,
        ctaUrl: "https://jdlcore.com/portal",
        ctaLabel: "Open the portal",
        footer: `Job reference: ${inv.jobRef}`,
      }),
    });

    if (toSend.kind === "invoice_due_soon") counts.dueSoon += 1;
    else if (toSend.kind === "invoice_overdue_7") counts.overdue7 += 1;
    else {
      counts.overdue14 += 1;
      await notifyStaffBoth({
        roles: ["operations", "administrator", "superadmin"],
        type: "invoice_overdue_escalation",
        title: `Invoice ${inv.number} is 14+ days overdue`,
        body: `${inv.clientName} still owes ${amount} on ${inv.jobRef} (due ${due}).`,
        link: `/admin/jobs/${inv.jobId}`,
        emailSubject: `[${inv.jobRef}] Invoice ${inv.number} is 14+ days overdue`,
        emailHtml: brandedEmailHtml({
          label: "JDL CORE ADMIN",
          heading: `Invoice ${inv.number} is 14+ days overdue`,
          bodyLines: [`${inv.clientName} still owes <strong>${amount}</strong> on ${inv.jobRef} (due ${due}).`, "The client has already had automated reminders. It may need a call."],
          ctaUrl: `https://jdlcore.com/admin/jobs/${inv.jobId}`,
          ctaLabel: "Open Job",
        }),
      });
    }
  }

  return { overdueFlagged, ...counts };
}
