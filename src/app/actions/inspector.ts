"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { clients, inspectors, jobCompletionData, jobUpdates, jobs, stockReadings } from "@/db/schema";
import { createInspectorSession, destroyInspectorSession, getInspector } from "@/lib/inspector-auth";
import { verifyPassword } from "@/lib/portal-auth";
import { canTransition, type Actor } from "@/lib/job-workflow";
import type { JobStatus } from "@/lib/jobs";
import { notify } from "@/lib/notifications";
import type { FormState } from "./submissions";

const initialFail = (message: string): FormState => ({ ok: false, message });

/* ---------------- Login / logout ---------------- */

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function inspectorLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Enter a valid email and password.");

  const database = requireDb();
  const rows = await database
    .select()
    .from(inspectors)
    .where(eq(inspectors.email, parsed.data.email.toLowerCase()))
    .limit(1);
  const row = rows[0];
  if (!row || !row.active || row.status !== "active" || !row.passwordHash) {
    return initialFail("Invalid email or password.");
  }
  if (!verifyPassword(parsed.data.password, row.passwordHash)) {
    return initialFail("Invalid email or password.");
  }

  await createInspectorSession(row.id);
  await database.update(inspectors).set({ lastLoginAt: new Date() }).where(eq(inspectors.id, row.id));
  redirect("/inspector");
}

export async function inspectorLogout(): Promise<void> {
  await destroyInspectorSession();
  redirect("/inspector/login");
}

async function loadOwnJob(jobId: number, inspectorId: number) {
  const rows = await requireDb().select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job || job.assignedInspectorId !== inspectorId) return null;
  return job;
}

function revalidateJob(jobId: number) {
  revalidatePath(`/inspector/jobs/${jobId}`);
  revalidatePath("/inspector");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  revalidatePath(`/portal/jobs/${jobId}`);
}

async function notifyOperationsRole(jobRef: string, title: string, body: string | undefined, jobId: number) {
  // Operations staff aren't individually addressed here — the admin jobs list
  // already surfaces every open job, so we skip a per-staff in-app notification
  // and rely on that list plus email being wired later if needed.
  void jobRef;
  void title;
  void body;
  void jobId;
}

const jobIdSchema = z.object({ jobId: z.coerce.number().int().positive() });

/* ---------------- Accept / Decline ---------------- */

export async function acceptAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid job.");
  const job = await loadOwnJob(parsed.data.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");

  const actor: Actor = { type: "inspector", id: inspector.id, name: inspector.name };
  if (!canTransition(job.status as JobStatus, "inspector_accepted", actor)) {
    return initialFail("This job can't be accepted right now.");
  }

  const database = requireDb();
  await database
    .update(jobs)
    .set({ status: "inspector_accepted", acceptedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobs.id, job.id));
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: "inspector_accepted",
    note: `Accepted by ${inspector.name}.`,
    actorType: "inspector",
    actorId: inspector.id,
    actorName: inspector.name,
  });

  revalidateJob(job.id);
  return { ok: true, message: "Assignment accepted." };
}

const declineSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, "Tell Operations why you're declining."),
});

export async function declineAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = declineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const job = await loadOwnJob(parsed.data.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");

  const actor: Actor = { type: "inspector", id: inspector.id, name: inspector.name };
  if (!canTransition(job.status as JobStatus, "awaiting_assignment", actor)) {
    return initialFail("This job can't be declined right now.");
  }

  const database = requireDb();
  await database
    .update(jobs)
    .set({ status: "awaiting_assignment", assignedInspectorId: null, updatedAt: new Date() })
    .where(eq(jobs.id, job.id));
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: "awaiting_assignment",
    note: `Declined by ${inspector.name}: ${parsed.data.reason}`,
    actorType: "inspector",
    actorId: inspector.id,
    actorName: inspector.name,
  });

  revalidateJob(job.id);
  return { ok: true, message: "Assignment declined — sent back to Operations." };
}

/* ---------------- Progress updates ---------------- */

const updateSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  note: z.string().trim().min(2, "Enter a short status update."),
});

export async function postProgressUpdate(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const job = await loadOwnJob(parsed.data.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");

  const actor: Actor = { type: "inspector", id: inspector.id, name: inspector.name };
  const nextStatus: JobStatus = "in_progress";
  const statusChanges = job.status !== "in_progress";
  if (statusChanges && !canTransition(job.status as JobStatus, nextStatus, actor)) {
    return initialFail("Can't post an update on this job right now.");
  }

  const database = requireDb();
  if (statusChanges) {
    await database.update(jobs).set({ status: nextStatus, updatedAt: new Date() }).where(eq(jobs.id, job.id));
  } else {
    await database.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, job.id));
  }
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: nextStatus,
    note: parsed.data.note,
    actorType: "inspector",
    actorId: inspector.id,
    actorName: inspector.name,
  });

  revalidateJob(job.id);
  return { ok: true, message: "Update posted." };
}

/* ---------------- Completion data (section 7) ---------------- */

const completionSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  dateTimeStarted: z.string().optional(),
  dateTimeCompleted: z.string().optional(),
  service: z.string().trim().max(200).optional(),
  gov: z.string().optional(),
  gsv: z.string().optional(),
  metricTonnesAir: z.string().optional(),
  metricTonnesVacuum: z.string().optional(),
  inspectorComments: z.string().trim().max(4000).optional(),
});

const decimal3 = z.string().regex(/^\d+(\.\d{1,3})?$/, "Enter a number with up to 3 decimal places.");

function parseDecimal3(raw: string | undefined): { ok: true; value: string | null } | { ok: false; message: string } {
  if (!raw || raw.trim() === "") return { ok: true, value: null };
  const parsed = decimal3.safeParse(raw.trim());
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  return { ok: true, value: parsed.data };
}

export async function saveCompletionData(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = completionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Check the fields entered.");
  const f = parsed.data;
  const job = await loadOwnJob(f.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");
  if (!["inspector_accepted", "in_progress", "rejected_amendment"].includes(job.status)) {
    return initialFail("This job isn't open for completion data right now.");
  }

  const gov = parseDecimal3(f.gov);
  if (!gov.ok) return initialFail(`GOV: ${gov.message}`);
  const gsv = parseDecimal3(f.gsv);
  if (!gsv.ok) return initialFail(`GSV: ${gsv.message}`);
  const mtAir = parseDecimal3(f.metricTonnesAir);
  if (!mtAir.ok) return initialFail(`Metric Tonnes in Air: ${mtAir.message}`);
  const mtVac = parseDecimal3(f.metricTonnesVacuum);
  if (!mtVac.ok) return initialFail(`Metric Tonnes in Vacuum: ${mtVac.message}`);

  const database = requireDb();
  const existing = await database
    .select({ id: jobCompletionData.id })
    .from(jobCompletionData)
    .where(eq(jobCompletionData.jobId, f.jobId))
    .limit(1);

  const values = {
    dateTimeStarted: f.dateTimeStarted ? new Date(f.dateTimeStarted) : null,
    dateTimeCompleted: f.dateTimeCompleted ? new Date(f.dateTimeCompleted) : null,
    service: f.service || null,
    gov: gov.value,
    gsv: gsv.value,
    metricTonnesAir: mtAir.value,
    metricTonnesVacuum: mtVac.value,
    inspectorComments: f.inspectorComments || null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await database.update(jobCompletionData).set(values).where(eq(jobCompletionData.id, existing[0].id));
  } else {
    await database.insert(jobCompletionData).values({ jobId: f.jobId, ...values });
  }

  revalidateJob(f.jobId);
  return { ok: true, message: "Completion data saved." };
}

/* ---------------- Stock readings (section 14, stock monitoring jobs only) ---------------- */

const stockReadingSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  tankId: z.coerce.number().int().positive(),
  readingDate: z.string().min(1, "Pick a date."),
  openingStock: z.string().optional(),
  receipts: z.string().optional(),
  transfers: z.string().optional(),
  dischargesLoads: z.string().optional(),
  closingStock: z.string().optional(),
  gsv: z.string().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function addStockReading(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = stockReadingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Check the fields entered.");
  const f = parsed.data;
  const job = await loadOwnJob(f.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");
  if (job.serviceType !== "stock_monitoring") {
    return initialFail("Stock readings are only for Stock Monitoring jobs.");
  }

  const fields = [
    ["openingStock", f.openingStock] as const,
    ["receipts", f.receipts] as const,
    ["transfers", f.transfers] as const,
    ["dischargesLoads", f.dischargesLoads] as const,
    ["closingStock", f.closingStock] as const,
    ["gsv", f.gsv] as const,
  ];
  const parsedValues: Record<string, string | null> = {};
  for (const [key, raw] of fields) {
    const result = parseDecimal3(raw);
    if (!result.ok) return initialFail(`${key}: ${result.message}`);
    parsedValues[key] = result.value;
  }

  await requireDb().insert(stockReadings).values({
    jobId: f.jobId,
    tankId: f.tankId,
    readingDate: new Date(f.readingDate),
    openingStock: parsedValues.openingStock,
    receipts: parsedValues.receipts,
    transfers: parsedValues.transfers,
    dischargesLoads: parsedValues.dischargesLoads,
    closingStock: parsedValues.closingStock,
    gsv: parsedValues.gsv,
    notes: f.notes || null,
    recordedByInspectorId: inspector.id,
  });

  revalidatePath(`/inspector/jobs/${f.jobId}`);
  revalidatePath(`/admin/jobs/${f.jobId}`);
  return { ok: true, message: "Stock reading logged." };
}

/* ---------------- Submit / amend ---------------- */

export async function submitForApproval(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid job.");
  const job = await loadOwnJob(parsed.data.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");

  const actor: Actor = { type: "inspector", id: inspector.id, name: inspector.name };
  if (!canTransition(job.status as JobStatus, "awaiting_approval", actor)) {
    return initialFail("This job isn't ready to submit.");
  }

  const database = requireDb();
  const completion = await database
    .select({ id: jobCompletionData.id })
    .from(jobCompletionData)
    .where(eq(jobCompletionData.jobId, job.id))
    .limit(1);
  if (!completion[0]) return initialFail("Enter completion data before submitting.");

  const now = new Date();
  await database.update(jobs).set({ status: "awaiting_approval", updatedAt: now }).where(eq(jobs.id, job.id));
  await database.update(jobCompletionData).set({ submittedAt: now }).where(eq(jobCompletionData.jobId, job.id));
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: "awaiting_approval",
    note: `Submitted for approval by ${inspector.name}.`,
    actorType: "inspector",
    actorId: inspector.id,
    actorName: inspector.name,
  });

  const recipient = await database
    .select({ email: clients.email, ref: jobs.ref, clientId: jobs.clientId })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(jobs.id, job.id))
    .limit(1);
  if (recipient[0]) {
    await notify({
      recipientType: "client",
      recipientId: recipient[0].clientId,
      jobId: job.id,
      type: "job_completed",
      title: `Job completed — ${recipient[0].ref}`,
      body: "The inspector has completed the work and it's now under Operations review.",
      link: `/portal/jobs/${job.id}`,
    });
  }
  await notifyOperationsRole(job.ref, "Report awaiting approval", undefined, job.id);

  revalidateJob(job.id);
  return { ok: true, message: "Submitted to Operations for approval." };
}

export async function amendAndResubmit(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid job.");
  const job = await loadOwnJob(parsed.data.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");
  if (job.status !== "rejected_amendment") return initialFail("This job isn't awaiting amendment.");

  const database = requireDb();
  const now = new Date();
  await database.update(jobs).set({ status: "awaiting_approval", updatedAt: now }).where(eq(jobs.id, job.id));
  await database.update(jobCompletionData).set({ submittedAt: now }).where(eq(jobCompletionData.jobId, job.id));
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: "awaiting_approval",
    note: `Amended and resubmitted by ${inspector.name}.`,
    actorType: "inspector",
    actorId: inspector.id,
    actorName: inspector.name,
  });

  revalidateJob(job.id);
  return { ok: true, message: "Resubmitted to Operations." };
}
