"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
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
import { notifyStaffBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";
import { reviewUploadedFile } from "@/lib/ai/document-review";
import { getPaystackConfig, initializeTransaction, isPaystackConfigured } from "@/lib/paystack";
import type { FormState } from "./submissions";

async function siteOrigin(): Promise<string> {
  const values = await headers();
  const host = values.get("x-forwarded-host") ?? values.get("host") ?? "localhost:3000";
  const protocol = values.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

const OPS_ROLES = ["operations", "administrator", "superadmin"] as const;

export type PortalFormState = { ok: boolean; message: string };

async function notifyOpsOfJob(jobId: number, type: string, title: string, body: string): Promise<void> {
  await notifyStaffBoth({
    roles: [...OPS_ROLES],
    type,
    title,
    body,
    link: `/admin/jobs/${jobId}`,
    emailSubject: title,
    emailHtml: brandedEmailHtml({
      label: "JDL CORE ADMIN",
      heading: title,
      bodyLines: [body],
      ctaUrl: `https://jdlcore.com/admin/jobs/${jobId}`,
      ctaLabel: "Open Job",
    }),
  });
}

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

  await notifyOpsOfJob(
    jobId,
    "service_requested",
    `New service request from ${client.name}`,
    `${client.name} requested ${f.service}. It's awaiting inspector assignment.`,
  );

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

  if (receiptFileData) {
    const amount = (row.invoice.amountCents / 100).toFixed(2);
    await reviewUploadedFile({
      jobId: f.jobId,
      jobRef: row.job.ref,
      targetType: "receipt",
      targetId: f.invoiceId,
      fileDataUrl: receiptFileData,
      context: `Invoice ${row.invoice.number} is for ${row.invoice.currency} ${amount}. Reference given by client: ${f.paymentReference || "(none)"}.`,
    });
  }

  await notifyOpsOfJob(
    f.jobId,
    "payment_receipt_submitted",
    `Payment receipt submitted — ${row.job.ref}`,
    `${client.name} submitted a payment receipt for invoice ${row.invoice.number}. It needs verification.`,
  );

  revalidatePath(`/portal/jobs/${f.jobId}`);
  revalidatePath(`/admin/jobs/${f.jobId}`);
  return { ok: true, message: "Payment receipt submitted — Operations will verify it shortly." };
}

/* ---------------- Pay online with Paystack ---------------- */

const payOnlineSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  jobId: z.coerce.number().int().positive(),
});

export async function payInvoiceOnline(_prev: FormState, formData: FormData): Promise<FormState> {
  const client = await getPortalClient();
  if (!client) return { ok: false, message: "Please sign in again." };

  const parsed = payOnlineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Invalid invoice." };
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
  if (row.invoice.status === "paid") return { ok: false, message: "This invoice is already paid." };

  const config = await getPaystackConfig();
  if (!isPaystackConfigured(config)) {
    return { ok: false, message: "Online payments aren't set up yet — please pay by bank transfer below." };
  }

  const reference = `jdl-inv-${row.invoice.id}-${Date.now()}`;
  const site = await siteOrigin();
  const result = await initializeTransaction({
    email: client.email,
    amountCents: row.invoice.amountCents,
    currency: row.invoice.currency,
    reference,
    callbackUrl: `${site}/portal/pay/callback`,
    metadata: { invoiceId: row.invoice.id, jobId: row.job.id, invoiceNumber: row.invoice.number },
  });
  if (!result.ok) return { ok: false, message: result.error };

  await database.update(invoices).set({ paystackReference: reference }).where(eq(invoices.id, row.invoice.id));

  redirect(result.authorizationUrl);
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

  await notifyOpsOfJob(
    f.jobId,
    "client_comment",
    `New comment from ${client.name}`,
    f.body,
  );

  revalidatePath(`/portal/jobs/${f.jobId}`);
  revalidatePath(`/admin/jobs/${f.jobId}`);
  return { ok: true, message: "Comment added." };
}
