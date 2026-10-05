"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { clients, inspectors, invoices, jobUpdates, jobs } from "@/db/schema";
import { requireStaffRole } from "@/lib/staff-auth";
import { canTransition, canOverrideStatus, type Actor } from "@/lib/job-workflow";
import { JOB_STATUSES, JOB_STATUS_META, type JobStatus } from "@/lib/jobs";
import { assignJobToInspector, listServiceOptions } from "@/lib/assignment";
import { maybeAutoAssign } from "@/lib/automation/auto-assign";
import { approveJobCore } from "@/lib/job-approval";
import { recordApprovalDecision } from "@/lib/approval-checks";
import { notifyBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";
import type { FormState } from "./submissions";

const OPS_ROLES = ["operations", "administrator", "superadmin"] as const;
const ADMIN_ROLES = ["administrator", "superadmin"] as const;

const initialFail = (message: string): FormState => ({ ok: false, message });

async function loadJob(jobId: number) {
  const rows = await requireDb().select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return rows[0] ?? null;
}

async function clientEmailForJob(jobId: number) {
  const rows = await requireDb()
    .select({ email: clients.email, name: clients.name, ref: jobs.ref, clientId: jobs.clientId })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  return rows[0] ?? null;
}

function clientEmail(heading: string, bodyLines: string[], jobRef: string): string {
  return brandedEmailHtml({
    label: "JDL CORE CLIENT PORTAL",
    heading,
    bodyLines,
    ctaUrl: "https://jdlcore.com/portal",
    ctaLabel: "Open the portal",
    footer: `Job reference: ${jobRef}`,
  });
}

function inspectorEmail(heading: string, bodyLines: string[], jobRef: string): string {
  return brandedEmailHtml({
    label: "JDL CORE INSPECTOR PORTAL",
    heading,
    bodyLines,
    ctaUrl: "https://jdlcore.com/inspector",
    ctaLabel: "Open Inspector Portal",
    footer: `Job reference: ${jobRef}`,
  });
}

function revalidateJob(jobId: number) {
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  revalidatePath(`/inspector/jobs/${jobId}`);
  revalidatePath("/inspector");
  revalidatePath(`/portal/jobs/${jobId}`);
  revalidatePath("/portal");
}

/* ---------------- Assignment ---------------- */

const assignSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  inspectorId: z.coerce.number().int().positive(),
});

export async function assignInspector(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...OPS_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = assignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Pick an inspector.");
  const { jobId, inspectorId } = parsed.data;

  const job = await loadJob(jobId);
  if (!job) return initialFail("Job not found.");
  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, role: staff.role as Actor["role"] };
  if (!canTransition(job.status as JobStatus, "assigned", actor)) {
    return initialFail("This job can't be assigned right now.");
  }

  const result = await assignJobToInspector({
    jobId,
    inspectorId,
    actor: { type: "staff", id: staff.id, name: staff.name },
    note: (name, reassign) => (reassign ? `Reassigned to ${name}.` : `Assigned to ${name}.`),
  });
  if (!result.ok) return initialFail(result.reason);

  revalidateJob(jobId);
  return { ok: true, message: result.isReassign ? "Job reassigned." : "Job assigned." };
}

/* ---------------- Job details ---------------- */

const detailsSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  title: z.string().trim().max(200).optional(),
  serviceType: z.string().trim().max(60).optional(),
  location: z.string().trim().max(200).optional(),
  tankOrDepot: z.string().trim().max(120).optional(),
});

/**
 * Lets staff fill in or correct the service type, location and depot/tank of a job, which is what
 * auto-assignment matches on. Recorded on the job timeline. For a job still waiting for an
 * inspector, tries automatic assignment straight away (if it is switched on).
 */
export async function updateJobDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...OPS_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = detailsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Check the details entered.");
  const f = parsed.data;

  const job = await loadJob(f.jobId);
  if (!job) return initialFail("Job not found.");
  if (job.status === "closed") return initialFail("This job is closed and can't be edited.");

  const options = await listServiceOptions();
  let serviceType = job.serviceType;
  let serviceLabel: string | null = null;
  if (f.serviceType) {
    const option = options.find((o) => o.key === f.serviceType);
    if (!option) return initialFail("Pick a service from the list.");
    serviceType = option.key;
    serviceLabel = option.label;
  }
  const location = f.location ? f.location : null;
  const tankOrDepot = f.tankOrDepot ? f.tankOrDepot : null;

  // A blank title keeps the current one, so the job can never end up untitled.
  const title = f.title ? f.title : job.service;

  const changes: string[] = [];
  if (title !== job.service) changes.push(`title set to ${title}`);
  if (serviceType !== job.serviceType) changes.push(`service type set to ${serviceLabel ?? serviceType}`);
  if (location !== job.location) changes.push(location ? `location set to ${location}` : "location cleared");
  if (tankOrDepot !== job.tankOrDepot) changes.push(tankOrDepot ? `tank/depot set to ${tankOrDepot}` : "tank/depot cleared");
  if (changes.length === 0) return { ok: true, message: "Nothing to change." };

  const database = requireDb();
  // updatedAt is left alone on purpose so this doesn't hide a job that has genuinely been stuck.
  await database.update(jobs).set({ service: title, serviceType, location, tankOrDepot }).where(eq(jobs.id, job.id));
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: job.status,
    note: `Details updated by ${staff.name}: ${changes.join("; ")}.`,
    actorType: "staff",
    actorId: staff.id,
    actorName: staff.name,
  });

  let message = "Job details saved.";
  if (job.status === "awaiting_assignment") {
    const auto = await maybeAutoAssign(job.id);
    if (auto.outcome === "assigned") message = `Job details saved. Assigned automatically to ${auto.inspectorName}.`;
    else if (auto.outcome === "no_match") message = `Job details saved. No inspector matched automatically (${auto.why}), so it's waiting for you to assign.`;
  }

  revalidateJob(job.id);
  return { ok: true, message };
}

/* ---------------- Approve / Reject ---------------- */

const jobIdSchema = z.object({ jobId: z.coerce.number().int().positive() });

export async function approveJob(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...OPS_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid job.");
  const { jobId } = parsed.data;

  const job = await loadJob(jobId);
  if (!job) return initialFail("Job not found.");
  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, role: staff.role as Actor["role"] };
  if (!canTransition(job.status as JobStatus, "approved", actor)) {
    return initialFail("This job isn't awaiting approval.");
  }

  const result = await approveJobCore({ jobId, actor: { type: "staff", id: staff.id, name: staff.name } });
  if (!result.ok) return initialFail(result.reason);
  const auto = result.invoice;
  await recordApprovalDecision(jobId, "approved");

  revalidateJob(jobId);
  if (auto.outcome === "issued") {
    return { ok: true, message: `Job approved. Certificate of Quantity and invoice ${auto.number} issued automatically.` };
  }
  return { ok: true, message: "Job approved. Certificate of Quantity issued. No invoice has been sent yet: issue it from the Invoices section on this page when the amount is ready." };
}

const rejectSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  comment: z.string().trim().min(3, "A rejection comment is required."),
});

export async function rejectJob(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...OPS_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = rejectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { jobId, comment } = parsed.data;

  const job = await loadJob(jobId);
  if (!job) return initialFail("Job not found.");
  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, role: staff.role as Actor["role"] };
  if (!canTransition(job.status as JobStatus, "rejected_amendment", actor)) {
    return initialFail("This job isn't awaiting approval.");
  }

  const database = requireDb();
  await database
    .update(jobs)
    .set({ status: "rejected_amendment", updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
  await database.insert(jobUpdates).values({
    jobId,
    status: "rejected_amendment",
    note: comment,
    actorType: "staff",
    actorId: staff.id,
    actorName: staff.name,
  });

  if (job.assignedInspectorId) {
    const inspRows = await database
      .select({ email: inspectors.email })
      .from(inspectors)
      .where(eq(inspectors.id, job.assignedInspectorId))
      .limit(1);
    if (inspRows[0]) {
      await notifyBoth({
        recipientType: "inspector",
        recipientId: job.assignedInspectorId,
        email: inspRows[0].email,
        jobId,
        type: "amendment_required",
        title: `Amendment required — ${job.ref}`,
        body: comment,
        link: `/inspector/jobs/${jobId}`,
        emailSubject: `[${job.ref}] Amendment required - JDL Core`,
        emailHtml: inspectorEmail(`Amendment required — ${job.ref}`, [comment], job.ref),
      });
    }
  }

  await recordApprovalDecision(jobId, "rejected");

  revalidateJob(jobId);
  return { ok: true, message: "Job returned to the inspector for amendment." };
}

/* ---------------- Client rejected the issued report ---------------- */

const reportDecisionSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  comment: z.string().trim().min(3, "A comment is required.").max(2000),
});

/** The client's own words from the latest rejection, for passing on to the inspector. */
async function latestClientRejection(jobId: number): Promise<string | null> {
  const rows = await requireDb()
    .select({ note: jobUpdates.note })
    .from(jobUpdates)
    .where(and(eq(jobUpdates.jobId, jobId), eq(jobUpdates.status, "report_rejected")))
    .orderBy(desc(jobUpdates.id))
    .limit(1);
  return rows[0]?.note ?? null;
}

/** Operations agrees the report needs work: sends the job back to the inspector for amendment. */
export async function returnRejectedReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...OPS_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = reportDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { jobId, comment } = parsed.data;

  const job = await loadJob(jobId);
  if (!job) return initialFail("Job not found.");
  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, role: staff.role as Actor["role"] };
  if (job.status !== "report_rejected" || !canTransition(job.status as JobStatus, "rejected_amendment", actor)) {
    return initialFail("This job isn't waiting on a rejected report.");
  }
  if (!job.assignedInspectorId) return initialFail("This job has no inspector to return it to.");

  const database = requireDb();
  const clientReason = await latestClientRejection(jobId);
  const updated = await database
    .update(jobs)
    .set({ status: "rejected_amendment", updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "report_rejected")))
    .returning({ id: jobs.id });
  if (updated.length === 0) return initialFail("This job has just changed. Refresh and try again.");
  await database.insert(jobUpdates).values({
    jobId,
    status: "rejected_amendment",
    note: `Returned for amendment after the client rejected the report. ${comment}`,
    actorType: "staff",
    actorId: staff.id,
    actorName: staff.name,
  });

  const inspRows = await database
    .select({ email: inspectors.email })
    .from(inspectors)
    .where(eq(inspectors.id, job.assignedInspectorId))
    .limit(1);
  if (inspRows[0]) {
    await notifyBoth({
      recipientType: "inspector",
      recipientId: job.assignedInspectorId,
      email: inspRows[0].email,
      jobId,
      type: "amendment_required",
      title: `Amendment required: ${job.ref}`,
      body: comment,
      link: `/inspector/jobs/${jobId}`,
      emailSubject: `[${job.ref}] Amendment required - JDL Core`,
      emailHtml: inspectorEmail(
        `Amendment required: ${job.ref}`,
        ["The client rejected the issued report, and Operations has returned the job to you.", comment, clientReason ?? ""].filter(Boolean),
        job.ref,
      ),
    });
  }

  const recipient = await clientEmailForJob(jobId);
  if (recipient) {
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient.clientId,
      email: recipient.email,
      jobId,
      type: "report_rejection_accepted",
      title: `Your report is being amended: ${job.ref}`,
      body: comment,
      link: `/portal/jobs/${jobId}`,
      emailSubject: `[${recipient.ref}] Your report is being amended - JDL Core`,
      emailHtml: clientEmail(
        `Your report on ${recipient.ref} is being amended`,
        ["Operations reviewed your rejection and has returned the report to the inspector for amendment.", comment, "You will be notified when the amended report is issued."],
        recipient.ref,
      ),
    });
  }

  revalidateJob(jobId);
  return { ok: true, message: "Job returned to the inspector for amendment. The client has been told." };
}

/** Operations stands by the report: explains why to the client and puts the job back where it was. */
export async function upholdRejectedReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...OPS_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = reportDecisionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { jobId, comment } = parsed.data;

  const job = await loadJob(jobId);
  if (!job) return initialFail("Job not found.");
  if (job.status !== "report_rejected") return initialFail("This job isn't waiting on a rejected report.");

  const database = requireDb();
  const invoiced = await database.select({ id: invoices.id }).from(invoices).where(eq(invoices.jobId, jobId)).limit(1);
  const backTo: JobStatus = invoiced[0] ? "invoice_issued" : "report_issued";
  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, role: staff.role as Actor["role"] };
  if (!canTransition("report_rejected", backTo, actor)) return initialFail("Unauthorized");

  const updated = await database
    .update(jobs)
    .set({ status: backTo, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.status, "report_rejected")))
    .returning({ id: jobs.id });
  if (updated.length === 0) return initialFail("This job has just changed. Refresh and try again.");
  await database.insert(jobUpdates).values({
    jobId,
    status: backTo,
    note: `Report upheld by ${staff.name} after the client's rejection. ${comment}`,
    actorType: "staff",
    actorId: staff.id,
    actorName: staff.name,
  });

  const recipient = await clientEmailForJob(jobId);
  if (recipient) {
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient.clientId,
      email: recipient.email,
      jobId,
      type: "report_upheld",
      title: `Report upheld: ${job.ref}`,
      body: comment,
      link: `/portal/jobs/${jobId}`,
      emailSubject: `[${recipient.ref}] Response to your report rejection - JDL Core`,
      emailHtml: clientEmail(
        `Operations reviewed your rejection on ${recipient.ref}`,
        ["After review, the report stands as issued. Operations' response:", comment, "You can reply in the job's group chat if you want to discuss it further."],
        recipient.ref,
      ),
    });
  }

  revalidateJob(jobId);
  return { ok: true, message: "Report upheld. The client has been sent your explanation." };
}

/* ---------------- Payments ---------------- */

const invoiceActionSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  invoiceId: z.coerce.number().int().positive(),
});

export async function verifyPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...OPS_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = invoiceActionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid invoice.");
  const { jobId, invoiceId } = parsed.data;

  const job = await loadJob(jobId);
  if (!job) return initialFail("Job not found.");

  const invRows = await requireDb().select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  const invoice = invRows[0];
  if (!invoice || invoice.jobId !== jobId) return initialFail("Invoice not found.");
  if (invoice.status !== "payment_submitted") return initialFail("No payment submission to verify.");

  const database = requireDb();
  const now = new Date();
  await database
    .update(invoices)
    .set({ status: "paid", paymentVerifiedAt: now, verifiedByStaffId: staff.id, paidAt: now })
    .where(eq(invoices.id, invoiceId));

  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, role: staff.role as Actor["role"] };
  if (canTransition(job.status as JobStatus, "paid", actor)) {
    await database.update(jobs).set({ status: "paid", updatedAt: now }).where(eq(jobs.id, jobId));
    await database.insert(jobUpdates).values({
      jobId,
      status: "paid",
      note: `Payment verified by ${staff.name}.`,
      actorType: "staff",
      actorId: staff.id,
      actorName: staff.name,
    });
  }

  const recipient = await clientEmailForJob(jobId);
  if (recipient) {
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient.clientId,
      email: recipient.email,
      jobId,
      type: "payment_verified",
      title: `Payment verified — ${job.ref}`,
      link: `/portal/jobs/${jobId}`,
      emailSubject: `[${recipient.ref}] Payment verified - JDL Core`,
      emailHtml: clientEmail(`Payment verified for ${recipient.ref}`, ["Thank you — your payment has been verified."], recipient.ref),
    });
  }

  revalidateJob(jobId);
  return { ok: true, message: "Payment verified." };
}

const rejectPaymentSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  invoiceId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, "A reason is required."),
});

export async function rejectPaymentSubmission(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...OPS_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = rejectPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { jobId, invoiceId, reason } = parsed.data;

  const invRows = await requireDb().select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  const invoice = invRows[0];
  if (!invoice || invoice.jobId !== jobId) return initialFail("Invoice not found.");

  await requireDb()
    .update(invoices)
    .set({ status: "payment_rejected", paymentRejectedReason: reason })
    .where(eq(invoices.id, invoiceId));

  const recipient = await clientEmailForJob(jobId);
  if (recipient) {
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient.clientId,
      email: recipient.email,
      jobId,
      type: "payment_rejected",
      title: `Payment rejected — ${recipient.ref}`,
      body: reason,
      link: `/portal/jobs/${jobId}`,
      emailSubject: `[${recipient.ref}] Payment submission rejected - JDL Core`,
      emailHtml: clientEmail(`Payment rejected — ${recipient.ref}`, [reason], recipient.ref),
    });
  }

  revalidateJob(jobId);
  return { ok: true, message: "Payment submission rejected — client notified." };
}

/* ---------------- Close ---------------- */

export async function closeJob(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...OPS_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid job.");
  const { jobId } = parsed.data;

  const job = await loadJob(jobId);
  if (!job) return initialFail("Job not found.");
  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, role: staff.role as Actor["role"] };
  if (!canTransition(job.status as JobStatus, "closed", actor)) {
    return initialFail("This job can't be closed yet.");
  }

  const now = new Date();
  await requireDb()
    .update(jobs)
    .set({ status: "closed", closedAt: now, closedByStaffId: staff.id, updatedAt: now })
    .where(eq(jobs.id, jobId));
  await requireDb().insert(jobUpdates).values({
    jobId,
    status: "closed",
    note: `Closed by ${staff.name}.`,
    actorType: "staff",
    actorId: staff.id,
    actorName: staff.name,
  });

  revalidateJob(jobId);
  return { ok: true, message: "Job closed." };
}

/* ---------------- Manual override (administrator/superadmin only) ---------------- */

const overrideSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  status: z.string(),
  note: z.string().trim().min(3, "A note is required for a manual override."),
});

export async function overrideJobStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...ADMIN_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = overrideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const { jobId, status, note } = parsed.data;
  if (!JOB_STATUSES.includes(status as JobStatus)) return initialFail("Invalid status.");

  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, role: staff.role as Actor["role"] };
  if (!canOverrideStatus(actor)) return initialFail("Unauthorized");

  const database = requireDb();
  await database.update(jobs).set({ status, updatedAt: new Date() }).where(eq(jobs.id, jobId));
  await database.insert(jobUpdates).values({
    jobId,
    status,
    note: `Manual override by ${staff.name}: ${note}`,
    actorType: "staff",
    actorId: staff.id,
    actorName: staff.name,
  });

  revalidateJob(jobId);
  return { ok: true, message: `Status manually set to ${JOB_STATUS_META[status as JobStatus].label}.` };
}
