import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, invoices, jobs, jobUpdates } from "@/db/schema";
import { verifyTransaction } from "@/lib/paystack";
import { notifyBoth, notifyStaffBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";
import { canTransition, type Actor } from "@/lib/job-workflow";
import type { JobStatus } from "@/lib/jobs";

const OPS_ROLES = ["operations", "administrator", "superadmin"] as const;
const SYSTEM_ACTOR: Actor = { type: "system", id: 0, name: "Paystack" };

export type FinalizeResult =
  | { outcome: "paid"; invoiceId: number; jobId: number }
  | { outcome: "already_paid"; invoiceId: number; jobId: number }
  | { outcome: "not_success"; reason: string }
  | { outcome: "mismatch"; invoiceId: number; jobId: number }
  | { outcome: "not_found" }
  | { outcome: "error"; reason: string };

/**
 * Verifies a Paystack transaction reference against Paystack itself (never trusts
 * a webhook/callback payload alone) and, if genuinely successful, marks the matching
 * invoice paid. Idempotent — safe to call from both the webhook and the browser
 * callback for the same reference without double-processing or double-notifying.
 */
export async function finalizePaystackPayment(reference: string): Promise<FinalizeResult> {
  const verified = await verifyTransaction(reference);
  if (!verified.ok) return { outcome: "error", reason: verified.error };
  if (verified.status !== "success") return { outcome: "not_success", reason: verified.rawStatus };

  const database = requireDb();
  const rows = await database
    .select({ invoice: invoices, job: jobs, client: clients })
    .from(invoices)
    .innerJoin(jobs, eq(invoices.jobId, jobs.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(invoices.paystackReference, reference))
    .limit(1);
  const row = rows[0];
  if (!row) return { outcome: "not_found" };
  const { invoice, job, client } = row;

  if (invoice.status === "paid") return { outcome: "already_paid", invoiceId: invoice.id, jobId: job.id };

  if (verified.amountCents !== invoice.amountCents || verified.currency !== invoice.currency.toUpperCase()) {
    await database
      .update(invoices)
      .set({
        clientComment: `Paystack amount mismatch: paid ${verified.currency} ${(verified.amountCents / 100).toFixed(2)}, invoice is ${invoice.currency} ${(invoice.amountCents / 100).toFixed(2)}. Needs manual review.`,
      })
      .where(eq(invoices.id, invoice.id));
    await notifyStaffBoth({
      roles: [...OPS_ROLES],
      type: "payment_amount_mismatch",
      title: `Paystack amount mismatch — ${job.ref}`,
      body: `A Paystack payment for invoice ${invoice.number} doesn't match the invoice amount. It needs manual review before it can be marked paid.`,
      link: `/admin/jobs/${job.id}`,
      emailSubject: `[${job.ref}] Paystack amount mismatch — needs review`,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE ADMIN",
        heading: `Paystack amount mismatch — ${job.ref}`,
        bodyLines: [
          `A Paystack payment for invoice ${invoice.number} doesn't match the invoice amount. It needs manual review before it can be marked paid.`,
        ],
        ctaUrl: `https://jdlcore.com/admin/jobs/${job.id}`,
        ctaLabel: "Open Job",
      }),
    });
    return { outcome: "mismatch", invoiceId: invoice.id, jobId: job.id };
  }

  const now = new Date();
  // The `ne(status, "paid")` guard makes this atomic against a concurrent call
  // (webhook and browser callback can both land for the same reference).
  const updated = await database
    .update(invoices)
    .set({
      status: "paid",
      paidAt: now,
      paymentMethod: "paystack",
      paymentVerifiedAt: now,
      paymentReference: reference,
      paymentRejectedReason: null,
    })
    .where(and(eq(invoices.id, invoice.id), ne(invoices.status, "paid")))
    .returning({ id: invoices.id });

  if (updated.length === 0) return { outcome: "already_paid", invoiceId: invoice.id, jobId: job.id };

  if (canTransition(job.status as JobStatus, "paid", SYSTEM_ACTOR)) {
    await database.update(jobs).set({ status: "paid", updatedAt: now }).where(eq(jobs.id, job.id));
    await database.insert(jobUpdates).values({
      jobId: job.id,
      status: "paid",
      note: `Payment received online via Paystack (ref ${reference}).`,
      actorType: "system",
      actorId: null,
      actorName: "Paystack",
    });
  }

  await notifyBoth({
    recipientType: "client",
    recipientId: client.id,
    email: client.email,
    jobId: job.id,
    type: "payment_verified",
    title: `Payment received — ${job.ref}`,
    link: `/portal/jobs/${job.id}`,
    emailSubject: `[${job.ref}] Payment received - JDL Core`,
    emailHtml: brandedEmailHtml({
      label: "JDL CORE CLIENT PORTAL",
      heading: `Payment received for ${job.ref}`,
      bodyLines: ["Thank you — we've received your online payment and it's been automatically verified."],
      ctaUrl: "https://jdlcore.com/portal",
      ctaLabel: "Open the portal",
      footer: `Job reference: ${job.ref}`,
    }),
  });
  await notifyStaffBoth({
    roles: [...OPS_ROLES],
    type: "payment_verified",
    title: `Payment received via Paystack — ${job.ref}`,
    body: `${client.name} paid invoice ${invoice.number} online via Paystack. It's been automatically verified — no action needed.`,
    link: `/admin/jobs/${job.id}`,
    emailSubject: `[${job.ref}] Payment received via Paystack`,
    emailHtml: brandedEmailHtml({
      label: "JDL CORE ADMIN",
      heading: `Payment received via Paystack — ${job.ref}`,
      bodyLines: [
        `${client.name} paid invoice ${invoice.number} online via Paystack. It's been automatically verified — no action needed.`,
      ],
      ctaUrl: `https://jdlcore.com/admin/jobs/${job.id}`,
      ctaLabel: "Open Job",
    }),
  });

  return { outcome: "paid", invoiceId: invoice.id, jobId: job.id };
}
