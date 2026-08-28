"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { clients, inspectors, invoices, jobComments, jobUpdates, jobs } from "@/db/schema";
import { requireStaffRole } from "@/lib/staff-auth";
import { canTransition, canOverrideStatus, type Actor } from "@/lib/job-workflow";
import { JOB_STATUSES, JOB_STATUS_META, type JobStatus } from "@/lib/jobs";
import { generateCoqAndInvoice } from "@/lib/coq";
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
  const isReassign = job.status === "assigned";
  const actor: Actor = { type: "staff", id: staff.id, name: staff.name, role: staff.role as Actor["role"] };
  if (!canTransition(job.status as JobStatus, "assigned", actor)) {
    return initialFail("This job can't be assigned right now.");
  }

  const inspRows = await requireDb().select().from(inspectors).where(eq(inspectors.id, inspectorId)).limit(1);
  const inspector = inspRows[0];
  if (!inspector || !inspector.active || inspector.status !== "active") {
    return initialFail("Inspector not found or inactive.");
  }

  const database = requireDb();
  await database
    .update(jobs)
    .set({ status: "assigned", assignedInspectorId: inspectorId, assignedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobs.id, jobId));
  await database.insert(jobUpdates).values({
    jobId,
    status: "assigned",
    note: isReassign ? `Reassigned to ${inspector.name}.` : `Assigned to ${inspector.name}.`,
    actorType: "staff",
    actorId: staff.id,
    actorName: staff.name,
  });

  await notifyBoth({
    recipientType: "inspector",
    recipientId: inspectorId,
    email: inspector.email,
    jobId,
    type: "new_assignment",
    title: `New assignment — ${job.ref}`,
    body: `You've been assigned to ${job.service}.`,
    link: `/inspector/jobs/${jobId}`,
    emailSubject: `[${job.ref}] New assignment - JDL Core`,
    emailHtml: inspectorEmail(`New assignment — ${job.ref}`, [`You've been assigned to ${job.service}.`], job.ref),
  });

  const recipient = await clientEmailForJob(jobId);
  if (recipient) {
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient.clientId,
      email: recipient.email,
      jobId,
      type: "inspector_assigned",
      title: `Inspector assigned — ${job.ref}`,
      link: `/portal/jobs/${jobId}`,
      emailSubject: `[${recipient.ref}] Inspector assigned - JDL Core`,
      emailHtml: clientEmail(`Inspector assigned — ${recipient.ref}`, ["An inspector has been assigned to your request."], recipient.ref),
    });
  }

  revalidateJob(jobId);
  return { ok: true, message: isReassign ? "Job reassigned." : "Job assigned." };
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

  const database = requireDb();
  const now = new Date();
  await database
    .update(jobs)
    .set({ status: "approved", approvedAt: now, approvedByStaffId: staff.id, updatedAt: now })
    .where(eq(jobs.id, jobId));
  for (const status of ["approved", "report_issued", "invoice_issued"] as const) {
    await database.insert(jobUpdates).values({
      jobId,
      status,
      note: status === "approved" ? `Approved by ${staff.name}.` : null,
      actorType: status === "approved" ? "staff" : "system",
      actorId: status === "approved" ? staff.id : null,
      actorName: status === "approved" ? staff.name : "JDL Core",
    });
  }
  await database.update(jobs).set({ status: "invoice_issued", updatedAt: new Date() }).where(eq(jobs.id, jobId));

  await generateCoqAndInvoice(jobId, staff.id);

  revalidateJob(jobId);
  return { ok: true, message: "Job approved — Certificate of Quantity and invoice issued." };
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

  revalidateJob(jobId);
  return { ok: true, message: "Job returned to the inspector for amendment." };
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

/* ---------------- Comments (staff reply) ---------------- */

const staffCommentSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1).max(2000),
});

export async function addStaffJobComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaffRole([...OPS_ROLES]);
  if (!staff) return initialFail("Unauthorized");
  const parsed = staffCommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Enter a comment.");
  const { jobId, body } = parsed.data;

  const job = await loadJob(jobId);
  if (!job) return initialFail("Job not found.");

  await requireDb().insert(jobComments).values({
    jobId,
    authorType: "staff",
    authorId: staff.id,
    authorName: staff.name,
    body,
  });

  const recipient = await clientEmailForJob(jobId);
  if (recipient) {
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient.clientId,
      email: recipient.email,
      jobId,
      type: "job_comment",
      title: `New reply on ${job.ref}`,
      body: body.slice(0, 140),
      link: `/portal/jobs/${jobId}`,
      emailSubject: `[${job.ref}] New reply on your job - JDL Core`,
      emailHtml: clientEmail(`New reply on ${job.ref}`, [body.slice(0, 500)], job.ref),
    });
  }

  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath(`/portal/jobs/${jobId}`);
  return { ok: true, message: "Comment added." };
}
