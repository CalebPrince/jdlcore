import "server-only";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { inspectors, invoices, jobs, stockReadings, submissions } from "@/db/schema";
import { JOB_STATUS_META, type JobStatus } from "@/lib/jobs";
import { notifyBoth, notifyStaffBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";
import { claimEvent } from "./events";

const HOUR_MS = 60 * 60 * 1000;
const MAX_LISTED = 12;

/** How long a job may sit in a status before it counts as stuck. */
const STUCK_AFTER_HOURS: Partial<Record<JobStatus, number>> = {
  awaiting_assignment: 24,
  assigned: 24,
  inspector_accepted: 48,
  in_progress: 72,
  awaiting_approval: 24,
  rejected_amendment: 72,
};

function age(ms: number): string {
  const hours = Math.floor(ms / HOUR_MS);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
}

type Section = { heading: string; items: string[] };

function renderSection(s: Section): string {
  const shown = s.items.slice(0, MAX_LISTED).join(", ");
  const more = s.items.length > MAX_LISTED ? ` and ${s.items.length - MAX_LISTED} more` : "";
  return `<strong>${s.heading} (${s.items.length})</strong><br/>${shown}${more}`;
}

/**
 * One daily "what needs a human" digest to Operations: jobs sitting too long in a status,
 * stock-monitoring jobs missing daily tank readings, approved jobs still without an invoice, bank-transfer receipts waiting on verification,
 * and quote requests nobody has converted. It only lists work; it never approves, assigns,
 * verifies or converts anything. Also nudges an inspector once when their assignment (or a
 * returned amendment) has been sitting unanswered.
 */
export async function runOpsDigest() {
  const database = requireDb();
  const now = Date.now();
  const sections: Section[] = [];
  let inspectorNudges = 0;

  // ---- Jobs sitting too long -------------------------------------------------------------
  const activeStatuses = Object.keys(STUCK_AFTER_HOURS) as JobStatus[];
  const jobRows = await database
    .select({
      id: jobs.id,
      ref: jobs.ref,
      status: jobs.status,
      serviceType: jobs.serviceType,
      updatedAt: jobs.updatedAt,
      inspectorId: jobs.assignedInspectorId,
      inspectorEmail: inspectors.email,
      inspectorName: inspectors.name,
    })
    .from(jobs)
    .leftJoin(inspectors, eq(jobs.assignedInspectorId, inspectors.id))
    .where(inArray(jobs.status, activeStatuses));

  const byStatus = new Map<JobStatus, string[]>();
  for (const job of jobRows) {
    const status = job.status as JobStatus;
    const limit = STUCK_AFTER_HOURS[status];
    if (!limit) continue;
    // Stock-monitoring jobs run for weeks and log readings (which don't touch updatedAt),
    // so a quiet in_progress there is normal.
    if (status === "in_progress" && job.serviceType === "stock_monitoring") continue;
    const idleMs = now - job.updatedAt.getTime();
    if (idleMs < limit * HOUR_MS) continue;
    const list = byStatus.get(status) ?? [];
    list.push(`${job.ref} (${age(idleMs)})`);
    byStatus.set(status, list);

    if ((status === "assigned" || status === "rejected_amendment") && job.inspectorId && job.inspectorEmail) {
      const first = await claimEvent(`job_${status}_nudge`, `${job.id}:${job.updatedAt.getTime()}`);
      if (first) {
        inspectorNudges += 1;
        const title =
          status === "assigned"
            ? `Reminder: please accept or decline ${job.ref}`
            : `Reminder: amendment still needed on ${job.ref}`;
        await notifyBoth({
          recipientType: "inspector",
          recipientId: job.inspectorId,
          email: job.inspectorEmail,
          jobId: job.id,
          type: "job_reminder",
          title,
          link: `/inspector/jobs/${job.id}`,
          emailSubject: `[${job.ref}] ${title} - JDL Core`,
          emailHtml: brandedEmailHtml({
            label: "JDL CORE INSPECTOR PORTAL",
            heading: title,
            bodyLines: [
              status === "assigned"
                ? "This assignment has been waiting for a response. Please accept it, or decline it so Operations can reassign."
                : "Operations returned this job for changes. Please amend and resubmit it.",
            ],
            ctaUrl: "https://jdlcore.com/inspector",
            ctaLabel: "Open Inspector Portal",
            footer: `Job reference: ${job.ref}`,
          }),
        });
      }
    }
  }
  for (const status of activeStatuses) {
    const items = byStatus.get(status);
    if (items?.length) sections.push({ heading: `Stuck in "${JOB_STATUS_META[status].label}"`, items });
  }

  // ---- Stock-monitoring jobs with no recent tank reading ----------------------------------
  const monitored = await database
    .select({
      ref: jobs.ref,
      startedAt: jobs.acceptedAt,
      lastReading: sql<Date | null>`max(${stockReadings.readingDate})`,
    })
    .from(jobs)
    .leftJoin(stockReadings, eq(stockReadings.jobId, jobs.id))
    .where(and(eq(jobs.serviceType, "stock_monitoring"), inArray(jobs.status, ["inspector_accepted", "in_progress"])))
    .groupBy(jobs.id, jobs.ref, jobs.acceptedAt);
  const missingReadings: string[] = [];
  for (const job of monitored) {
    const last = job.lastReading ? new Date(job.lastReading).getTime() : (job.startedAt?.getTime() ?? null);
    if (last === null || now - last < 2 * 24 * HOUR_MS) continue;
    missingReadings.push(`${job.ref} (${job.lastReading ? "last reading" : "accepted"} ${age(now - last)} ago)`);
  }
  if (missingReadings.length) {
    sections.push({ heading: "Stock monitoring with no tank reading for 2+ days", items: missingReadings });
  }

  // ---- Approved but never invoiced -------------------------------------------------------
  const uninvoiced = await database
    .select({ ref: jobs.ref, updatedAt: jobs.updatedAt })
    .from(jobs)
    .leftJoin(invoices, eq(invoices.jobId, jobs.id))
    .where(and(eq(jobs.status, "invoice_issued"), isNull(invoices.id), lt(jobs.updatedAt, new Date(now - 24 * HOUR_MS))));
  if (uninvoiced.length) {
    sections.push({
      heading: "Approved, still needs an invoice",
      items: uninvoiced.map((j) => `${j.ref} (${age(now - j.updatedAt.getTime())})`),
    });
  }

  // ---- Bank-transfer receipts waiting on verification (verification stays manual) --------
  const receipts = await database
    .select({ number: invoices.number, ref: jobs.ref, submittedAt: invoices.paymentSubmittedAt })
    .from(invoices)
    .innerJoin(jobs, eq(invoices.jobId, jobs.id))
    .where(and(eq(invoices.status, "payment_submitted"), lt(invoices.paymentSubmittedAt, new Date(now - 24 * HOUR_MS))));
  if (receipts.length) {
    sections.push({
      heading: "Payment receipts awaiting your verification",
      items: receipts.map((r) => `${r.number} on ${r.ref} (${age(now - (r.submittedAt?.getTime() ?? now))})`),
    });
  }

  // ---- Quote requests nobody converted ---------------------------------------------------
  const quotes = await database
    .select({ name: submissions.name, createdAt: submissions.createdAt })
    .from(submissions)
    .where(
      and(
        eq(submissions.type, "quote"),
        isNull(submissions.convertedJobId),
        lt(submissions.createdAt, new Date(now - 24 * HOUR_MS)),
        gt(submissions.createdAt, new Date(now - 7 * 24 * HOUR_MS)),
      ),
    );
  if (quotes.length) {
    sections.push({
      heading: "Quote requests not yet converted (last 7 days)",
      items: quotes.map((q) => `${escapeHtml(q.name)} (${age(now - q.createdAt.getTime())})`),
    });
  }

  const total = sections.reduce((n, s) => n + s.items.length, 0);
  if (total > 0) {
    const title = `Daily operations digest: ${total} item${total === 1 ? "" : "s"} need attention`;
    await notifyStaffBoth({
      roles: ["operations", "administrator", "superadmin"],
      type: "ops_digest",
      title,
      body: sections.map((s) => `${s.heading}: ${s.items.length}`).join(" · "),
      link: "/admin/jobs",
      emailSubject: title,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE ADMIN",
        heading: title,
        bodyLines: sections.map(renderSection),
        ctaUrl: "https://jdlcore.com/admin/jobs",
        ctaLabel: "Open Jobs",
      }),
    });
  }

  return { itemsListed: total, sections: sections.length, inspectorNudges };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
