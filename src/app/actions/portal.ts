"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { clients, invoices, jobComments, jobUpdates, jobs } from "@/db/schema";
import {
  createPortalSession,
  destroyPortalSession,
  getPortalClient,
  verifyPassword,
} from "@/lib/portal-auth";
import { makeRef } from "@/lib/jobs";
import { notify } from "@/lib/notifications";
import type { FormState } from "./submissions";

export type PortalFormState = { ok: boolean; message: string };

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export async function portalLogin(
  _prev: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid email and password." };
  }

  let database;
  try {
    database = requireDb();
  } catch {
    return { ok: false, message: "Service temporarily unavailable." };
  }

  const rows = await database
    .select()
    .from(clients)
    .where(eq(clients.email, parsed.data.email.toLowerCase()))
    .limit(1);
  const client = rows[0];

  if (!client || !client.active || !verifyPassword(parsed.data.password, client.passwordHash)) {
    return { ok: false, message: "Invalid email or password." };
  }

  await createPortalSession(client.id);
  redirect("/portal");
}

export async function portalLogout(): Promise<void> {
  await destroyPortalSession();
  redirect("/portal/login");
}

/* ---------------- Request a service (section 2.2) ---------------- */

const requestSchema = z.object({
  serviceType: z.string().trim().min(1),
  service: z.string().trim().min(1),
  location: z.string().trim().max(200).optional(),
  product: z.string().trim().max(120).optional(),
  tankOrDepot: z.string().trim().max(120).optional(),
  requestedDate: z.string().optional(),
  clientRef: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function requestService(_prev: FormState, formData: FormData): Promise<FormState> {
  const client = await getPortalClient();
  if (!client) return { ok: false, message: "Please sign in again." };

  const parsed = requestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Pick a service and try again." };
  const f = parsed.data;

  const database = requireDb();
  let jobId: number;
  try {
    const inserted = await database
      .insert(jobs)
      .values({
        ref: `PENDING-${Date.now()}`,
        clientId: client.id,
        service: f.service,
        serviceType: f.serviceType,
        location: f.location || null,
        product: f.product || null,
        tankOrDepot: f.tankOrDepot || null,
        requestedDate: f.requestedDate ? new Date(f.requestedDate) : null,
        clientRef: f.clientRef || null,
        notes: f.notes || null,
        status: "awaiting_assignment",
      })
      .returning({ id: jobs.id });
    jobId = inserted[0].id;
    const ref = makeRef(jobId);
    await database.update(jobs).set({ ref }).where(eq(jobs.id, jobId));
    await database.insert(jobUpdates).values({
      jobId,
      status: "awaiting_assignment",
      note: "Request received.",
      actorType: "client",
      actorId: client.id,
      actorName: client.name,
    });
  } catch (err) {
    console.error("requestService:", err);
    return { ok: false, message: "Could not submit your request. Please try again." };
  }

  revalidatePath("/portal");
  revalidatePath("/admin/jobs");
  return { ok: true, message: "Request submitted — Operations will assign an inspector shortly." };
}

/* ---------------- Payment submission (section 3 / 11) ---------------- */

const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;

const paymentSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  jobId: z.coerce.number().int().positive(),
  paymentReference: z.string().trim().max(200).optional(),
  clientComment: z.string().trim().max(2000).optional(),
});

export async function markPaymentSubmitted(_prev: FormState, formData: FormData): Promise<FormState> {
  const client = await getPortalClient();
  if (!client) return { ok: false, message: "Please sign in again." };

  const parsed = paymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the fields and try again." };
  const f = parsed.data;

  const database = requireDb();
  const rows = await database
    .select({ invoice: invoices, job: jobs })
    .from(invoices)
    .innerJoin(jobs, eq(invoices.jobId, jobs.id))
    .where(eq(invoices.id, f.invoiceId))
    .limit(1);
  const row = rows[0];
  if (!row || row.job.id !== f.jobId || row.job.clientId !== client.id) {
    return { ok: false, message: "Invoice not found." };
  }

  let receiptFileData: string | null = null;
  let receiptMimeType: string | null = null;
  const file = formData.get("receiptFile");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_RECEIPT_BYTES) return { ok: false, message: "Receipt is larger than 4 MB." };
    const buf = Buffer.from(await file.arrayBuffer());
    receiptFileData = `data:${file.type || "application/octet-stream"};base64,${buf.toString("base64")}`;
    receiptMimeType = file.type || "application/octet-stream";
  } else {
    return { ok: false, message: "Attach a payment receipt (PDF or image)." };
  }

  await database
    .update(invoices)
    .set({
      status: "payment_submitted",
      receiptFileData,
      receiptMimeType,
      paymentReference: f.paymentReference || null,
      clientComment: f.clientComment || null,
      paymentSubmittedAt: new Date(),
      paymentRejectedReason: null,
    })
    .where(eq(invoices.id, f.invoiceId));

  revalidatePath(`/portal/jobs/${f.jobId}`);
  revalidatePath(`/admin/jobs/${f.jobId}`);
  return { ok: true, message: "Payment receipt submitted — Operations will verify it shortly." };
}

/* ---------------- Comments (section 3) ---------------- */

const commentSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  body: z.string().trim().min(1).max(2000),
});

export async function addJobComment(_prev: FormState, formData: FormData): Promise<FormState> {
  const client = await getPortalClient();
  if (!client) return { ok: false, message: "Please sign in again." };

  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a comment." };
  const f = parsed.data;

  const rows = await requireDb()
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.id, f.jobId))
    .limit(1);
  if (!rows[0]) return { ok: false, message: "Job not found." };

  await requireDb().insert(jobComments).values({
    jobId: f.jobId,
    authorType: "client",
    authorId: client.id,
    authorName: client.name,
    body: f.body,
  });

  revalidatePath(`/portal/jobs/${f.jobId}`);
  revalidatePath(`/admin/jobs/${f.jobId}`);
  return { ok: true, message: "Comment added." };
}
