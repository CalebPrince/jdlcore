"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { hashPassword } from "@/lib/portal-auth";
import { requireDb } from "@/db";
import {
  clients,
  documents,
  invoices,
  jobUpdates,
  jobs,
  submissions,
} from "@/db/schema";
import { JOB_STATUSES, JOB_STATUS_META, makeInvoiceNumber, makeRef } from "@/lib/jobs";
import { isEmailConfigured, getEmailConfig, sendNotification } from "@/lib/email";
import type { FormState } from "./submissions";

export type ConvertState = FormState & {
  jobId?: number;
  jobRef?: string;
  tempPassword?: string;
  clientCreated?: boolean;
  emailSent?: boolean;
};

function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `JDL-${out.slice(0, 5)}-${out.slice(5)}`;
}

async function clientEmailForJob(jobId: number): Promise<{
  email: string;
  name: string;
  ref: string;
} | null> {
  try {
    const database = requireDb();
    const rows = await database
      .select({ email: clients.email, name: clients.name, ref: jobs.ref })
      .from(jobs)
      .innerJoin(clients, eq(jobs.clientId, clients.id))
      .where(eq(jobs.id, jobId))
      .limit(1);
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

function notifyHtml(heading: string, bodyLines: string[], jobRef: string): string {
  return [
    `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2733">`,
    `<div style="background:#081826;padding:18px 24px;border-radius:8px 8px 0 0">`,
    `<strong style="color:#f6cf6e;font-size:15px;letter-spacing:1px">JDL CORE CLIENT PORTAL</strong>`,
    `</div>`,
    `<div style="border:1px solid #e5e2da;border-top:0;padding:24px;border-radius:0 0 8px 8px">`,
    `<h2 style="margin:0 0 12px;font-size:17px">${heading}</h2>`,
    ...bodyLines.map(
      (l) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.55">${l}</p>`,
    ),
    `<p style="margin:16px 0 0"><a href="https://jdlcore.com/portal" style="display:inline-block;background:#c98e12;color:#081826;font-weight:bold;font-size:13px;padding:10px 20px;border-radius:999px;text-decoration:none">Open the portal</a></p>`,
    `<p style="margin:18px 0 0;font-size:11px;color:#98a2ad">Job reference: ${jobRef}</p>`,
    `</div></div>`,
  ].join("");
}

const initialFail = (message: string): FormState => ({ ok: false, message });

/* ---------------- Clients ---------------- */

const clientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  password: z.string().min(8).max(200),
});

export async function createPortalClient(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAuthenticated())) return initialFail("Unauthorized");
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return initialFail("Check the fields: password must be at least 8 characters.");
  }
  const f = parsed.data;
  try {
    const database = requireDb();
    await database.insert(clients).values({
      name: f.name,
      company: f.company || null,
      email: f.email.toLowerCase(),
      phone: f.phone || null,
      passwordHash: hashPassword(f.password),
    });
  } catch (err) {
    console.error("createPortalClient:", err);
    return initialFail("Could not create client. Email may already be in use.");
  }
  revalidatePath("/admin/clients");
  return { ok: true, message: `Client ${f.name} created.` };
}

export async function resetClientPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAuthenticated())) return initialFail("Unauthorized");
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  if (!Number.isInteger(id)) return initialFail("Invalid client.");
  if (password.length < 8) return initialFail("New password must be at least 8 characters.");
  try {
    await requireDb()
      .update(clients)
      .set({ passwordHash: hashPassword(password) })
      .where(eq(clients.id, id));
  } catch {
    return initialFail("Could not reset password.");
  }
  revalidatePath("/admin/clients");
  return { ok: true, message: "Password reset." };
}

export async function toggleClientActive(formData: FormData): Promise<void> {
  if (!(await isAuthenticated())) return;
  const id = Number(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  if (!Number.isInteger(id)) return;
  await requireDb().update(clients).set({ active }).where(eq(clients.id, id));
  revalidatePath("/admin/clients");
}

/* ---------------- Jobs ---------------- */

const jobSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  service: z.string().trim().min(2).max(200),
  location: z.string().trim().max(200).optional(),
  cargoType: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function createJob(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAuthenticated())) return initialFail("Unauthorized");
  const parsed = jobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Please fill in client and service.");
  const f = parsed.data;
  try {
    const database = requireDb();
    const inserted = await database
      .insert(jobs)
      .values({
        ref: `PENDING-${Date.now()}`,
        clientId: f.clientId,
        service: f.service,
        location: f.location || null,
        cargoType: f.cargoType || null,
        notes: f.notes || null,
      })
      .returning({ id: jobs.id });
    const newId = inserted[0].id;
    await database
      .update(jobs)
      .set({ ref: makeRef(newId) })
      .where(eq(jobs.id, newId));
    await database.insert(jobUpdates).values({
      jobId: newId,
      status: "submitted",
      note: "Request received.",
    });
  } catch (err) {
    console.error("createJob:", err);
    return initialFail("Could not create job.");
  }
  revalidatePath("/admin/jobs");
  return { ok: true, message: "Job created." };
}

export async function updateJobStatus(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAuthenticated())) return initialFail("Unauthorized");
  const jobId = Number(formData.get("jobId"));
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!Number.isInteger(jobId)) return initialFail("Invalid job.");
  if (!JOB_STATUSES.includes(status as never)) return initialFail("Invalid status.");
  try {
    const database = requireDb();
    await database.insert(jobUpdates).values({ jobId, status, note: note || null });
    await database
      .update(jobs)
      .set({ status, updatedAt: new Date() })
      .where(eq(jobs.id, jobId));
  } catch {
    return initialFail("Could not update status.");
  }
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");

  const recipient = await clientEmailForJob(jobId);
  if (recipient) {
    const meta = JOB_STATUS_META[status as keyof typeof JOB_STATUS_META];
    const lines: string[] = [];
    if (note) lines.push(note);
    await sendNotification({
      to: recipient.email,
      subject: `[${recipient.ref}] ${meta?.label ?? "Update"} - JDL Core`,
      html: notifyHtml(
        `Your job ${recipient.ref} moved to "${meta?.label ?? status}"`,
        lines.length > 0
          ? lines
          : [meta?.description ?? "There is a new update on your job."],
        recipient.ref,
      ),
    });
  }
  return { ok: true, message: "Status updated." };
}

/* ---------------- Documents ---------------- */

const docSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  kind: z.enum(["report", "coq", "other"]),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(1000).optional().or(z.literal("")),
});

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function addDocument(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAuthenticated())) return initialFail("Unauthorized");
  const parsed = docSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Provide a title and either a file or a valid link.");
  const f = parsed.data;

  let fileData: string | null = null;
  let mimeType: string | null = null;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return initialFail("File is larger than 4 MB. Use a link instead.");
    }
    const buf = Buffer.from(await file.arrayBuffer());
    fileData = `data:${file.type || "application/octet-stream"};base64,${buf.toString("base64")}`;
    mimeType = file.type || "application/octet-stream";
  } else if (!f.url) {
    return initialFail("Attach a file or paste a link.");
  }

  try {
    await requireDb().insert(documents).values({
      jobId: f.jobId,
      kind: f.kind,
      title: f.title,
      url: f.url || null,
      fileData,
      mimeType,
    });
  } catch {
    return initialFail("Could not save document.");
  }
  revalidatePath(`/admin/jobs/${f.jobId}`);

  const recipient = await clientEmailForJob(f.jobId);
  if (recipient) {
    await sendNotification({
      to: recipient.email,
      subject: `[${recipient.ref}] New document available - JDL Core`,
      html: notifyHtml(
        `A new document is ready to download`,
        [
          `<strong>${f.title}</strong> has been added to job ${recipient.ref}.`,
          "Sign in to the portal to download it.",
        ],
        recipient.ref,
      ),
    });
  }
  return { ok: true, message: "Document added." };
}

/* ---------------- Invoices ---------------- */

const invoiceSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive().max(10_000_000),
  currency: z.enum(["GHS", "USD"]).default("GHS"),
  dueDate: z.string().optional(),
});

export async function createInvoice(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAuthenticated())) return initialFail("Unauthorized");
  const parsed = invoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Enter a valid amount.");
  const f = parsed.data;
  let invoiceNumber = "";
  try {
    const database = requireDb();
    const inserted = await database
      .insert(invoices)
      .values({
        number: `PENDING-${Date.now()}`,
        jobId: f.jobId,
        amountCents: Math.round(f.amount * 100),
        currency: f.currency,
        dueDate: f.dueDate ? new Date(f.dueDate) : null,
        status: "sent",
      })
      .returning({ id: invoices.id });
    invoiceNumber = makeInvoiceNumber(inserted[0].id);
    await database
      .update(invoices)
      .set({ number: invoiceNumber })
      .where(eq(invoices.id, inserted[0].id));
  } catch {
    return initialFail("Could not create invoice.");
  }
  revalidatePath(`/admin/jobs/${f.jobId}`);

  const recipient = await clientEmailForJob(f.jobId);
  if (recipient) {
    const amountStr = `${f.currency} ${f.amount.toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
    await sendNotification({
      to: recipient.email,
      subject: `[${recipient.ref}] New invoice - JDL Core`,
      html: notifyHtml(
        `Invoice ${invoiceNumber} has been issued`,
        [
          `Amount due: <strong>${amountStr}</strong>`,
          f.dueDate ? `Payment is due by ${f.dueDate}.` : "",
          "Download the PDF invoice from the portal.",
        ].filter(Boolean),
        recipient.ref,
      ),
    });
  }
  return { ok: true, message: "Invoice issued." };
}

export async function markInvoicePaid(formData: FormData): Promise<void> {
  if (!(await isAuthenticated())) return;
  const id = Number(formData.get("invoiceId"));
  const jobId = Number(formData.get("jobId"));
  if (!Number.isInteger(id)) return;
  await requireDb()
    .update(invoices)
    .set({ status: "paid", paidAt: new Date() })
    .where(eq(invoices.id, id));
  revalidatePath(`/admin/jobs/${jobId}`);
}

/* ---------------- Quote conversion ---------------- */

const convertSchema = z.object({
  submissionId: z.coerce.number().int().positive(),
  mode: z.enum(["new", "existing"]),
  clientId: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  service: z.string().trim().min(1).max(160),
  location: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function convertQuoteToJob(
  _prev: ConvertState,
  formData: FormData,
): Promise<ConvertState> {
  if (!(await isAuthenticated())) return { ok: false, message: "Unauthorized" };
  const parsed = convertSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the fields — name, email, and service are required.",
    };
  }
  const f = parsed.data;

  let database;
  try {
    database = requireDb();
  } catch {
    return { ok: false, message: "Database unavailable." };
  }

  // Guard: not already converted
  const existingSub = await database
    .select({ id: submissions.id, convertedJobId: submissions.convertedJobId })
    .from(submissions)
    .where(eq(submissions.id, f.submissionId))
    .limit(1);
  if (!existingSub[0]) return { ok: false, message: "Submission not found." };
  if (existingSub[0].convertedJobId) {
    return { ok: false, message: "This request was already converted." };
  }

  // Resolve client
  let clientId: number;
  let tempPassword: string | undefined;
  let clientCreated = false;

  try {
    if (f.mode === "existing") {
      if (!f.clientId) return { ok: false, message: "Pick a client." };
      const found = await database
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, f.clientId))
        .limit(1);
      if (!found[0]) return { ok: false, message: "Client not found." };
      clientId = found[0].id;
    } else {
      const dupe = await database
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.email, f.email.toLowerCase()))
        .limit(1);
      if (dupe[0]) {
        clientId = dupe[0].id;
      } else {
        tempPassword = generateTempPassword();
        const created = await database
          .insert(clients)
          .values({
            name: f.name,
            company: f.company || null,
            email: f.email.toLowerCase(),
            phone: f.phone || null,
            passwordHash: hashPassword(tempPassword),
          })
          .returning({ id: clients.id });
        clientId = created[0].id;
        clientCreated = true;
      }
    }

    // Create the job
    const insertedJob = await database
      .insert(jobs)
      .values({
        ref: `PENDING-${Date.now()}`,
        clientId,
        service: f.service,
        location: f.location || null,
        cargoType: null,
        notes: f.notes || null,
        status: "submitted",
      })
      .returning({ id: jobs.id });
    const jobId = insertedJob[0].id;
    const jobRef = makeRef(jobId);
    await database.update(jobs).set({ ref: jobRef }).where(eq(jobs.id, jobId));
    await database.insert(jobUpdates).values({
      jobId,
      status: "submitted",
      note: "Converted from website quote request.",
    });
    await database
      .update(submissions)
      .set({ convertedJobId: jobId })
      .where(eq(submissions.id, f.submissionId));

    revalidatePath("/admin/inbox");
    revalidatePath("/admin/jobs");
    revalidatePath("/admin/clients");

    // Welcome email for brand-new portal accounts
    let emailSent = false;
    if (clientCreated && tempPassword) {
      const config = await getEmailConfig();
      if (isEmailConfigured(config) && config.enabled) {
        const result = await sendNotification({
          to: f.email,
          subject: `Your JDL Core portal account - Job ${jobRef}`,
          html: notifyHtml(
            `Welcome to the JDL Core Client Portal`,
            [
              `Your quote request has been converted into job <strong>${jobRef}</strong>.`,
              `Sign in at jdlcore.com/portal/login with <strong>${f.email}</strong> and the temporary password: <strong>${tempPassword}</strong>`,
              "Please keep this email safe — you can ask us to reset the password at any time.",
            ],
            jobRef,
          ),
        });
        emailSent = result.sent;
      }
    }

    return {
      ok: true,
      message: clientCreated
        ? emailSent
          ? `Client account created — credentials emailed. Job ${jobRef} is live.`
          : `Client account created. Job ${jobRef} is live.`
        : `Attached to existing client. Job ${jobRef} is live.`,
      jobId,
      jobRef,
      tempPassword,
      clientCreated,
      emailSent,
    };
  } catch (err) {
    console.error("convertQuoteToJob:", err);
    return { ok: false, message: "Conversion failed — please try again." };
  }
}
