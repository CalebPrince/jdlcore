"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireStaffRole } from "@/lib/staff-auth";

const ADMIN_ROLES = ["administrator", "superadmin"] as const;
const OPS_ROLES = ["operations", "administrator", "superadmin"] as const;
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
import { getInvoiceSettings } from "@/lib/settings";
import { isEmailConfigured, getEmailConfig, sendNotification, brandedEmailHtml } from "@/lib/email";
import { notify, notifyBoth } from "@/lib/notifications";
import { reviewUploadedFile } from "@/lib/ai/document-review";
import { logAudit } from "@/lib/audit";
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
  clientId: number;
  email: string;
  name: string;
  ref: string;
} | null> {
  try {
    const database = requireDb();
    const rows = await database
      .select({ clientId: clients.id, email: clients.email, name: clients.name, ref: jobs.ref })
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
  return brandedEmailHtml({
    label: "JDL CORE CLIENT PORTAL",
    heading,
    bodyLines,
    ctaUrl: "https://jdlcore.com/portal",
    ctaLabel: "Open the portal",
    footer: `Job reference: ${jobRef}`,
  });
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
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return initialFail("Unauthorized");
  const parsed = clientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return initialFail("Check the fields: password must be at least 8 characters.");
  }
  const f = parsed.data;
  let clientId: number;
  try {
    const database = requireDb();
    const inserted = await database
      .insert(clients)
      .values({
        name: f.name,
        company: f.company || null,
        email: f.email.toLowerCase(),
        phone: f.phone || null,
        passwordHash: hashPassword(f.password),
      })
      .returning({ id: clients.id });
    clientId = inserted[0].id;
  } catch (err) {
    console.error("createPortalClient:", err);
    return initialFail("Could not create client. Email may already be in use.");
  }
  revalidatePath("/admin/clients");
  await logAudit({
    actor: current,
    action: "client.created",
    targetType: "client",
    targetId: clientId,
    summary: `Created client account for ${f.name} (${f.email}).`,
  });
  return { ok: true, message: `Client ${f.name} created.` };
}

export async function resetClientPassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return initialFail("Unauthorized");
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
  await logAudit({
    actor: current,
    action: "client.password_reset",
    targetType: "client",
    targetId: id,
    summary: `Reset password for client #${id}.`,
  });
  return { ok: true, message: "Password reset." };
}

export async function toggleClientActive(formData: FormData): Promise<void> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return;
  const id = Number(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  if (!Number.isInteger(id)) return;
  await requireDb().update(clients).set({ active }).where(eq(clients.id, id));
  revalidatePath("/admin/clients");
  await logAudit({
    actor: current,
    action: active ? "client.enabled" : "client.disabled",
    targetType: "client",
    targetId: id,
    summary: `Marked client #${id} as ${active ? "active" : "disabled"}.`,
  });
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
  if (!(await requireStaffRole([...ADMIN_ROLES]))) return initialFail("Unauthorized");
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
  if (!(await requireStaffRole([...OPS_ROLES]))) return initialFail("Unauthorized");
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

  let insertedId: number | null = null;
  try {
    const inserted = await requireDb()
      .insert(documents)
      .values({
        jobId: f.jobId,
        kind: f.kind,
        title: f.title,
        url: f.url || null,
        fileData,
        mimeType,
      })
      .returning({ id: documents.id });
    insertedId = inserted[0]?.id ?? null;
  } catch {
    return initialFail("Could not save document.");
  }
  revalidatePath(`/admin/jobs/${f.jobId}`);

  if (insertedId && fileData) {
    const jobRow = await requireDb().select({ ref: jobs.ref }).from(jobs).where(eq(jobs.id, f.jobId)).limit(1);
    if (jobRow[0]) {
      await reviewUploadedFile({
        jobId: f.jobId,
        jobRef: jobRow[0].ref,
        targetType: "document",
        targetId: insertedId,
        fileDataUrl: fileData,
        context: `Document type: ${f.kind}. Title: "${f.title}".`,
      });
    }
  }

  const recipient = await clientEmailForJob(f.jobId);
  if (recipient) {
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient.clientId,
      email: recipient.email,
      jobId: f.jobId,
      type: "document_added",
      title: `New document available on job ${recipient.ref}`,
      body: `${f.title} has been added to job ${recipient.ref}.`,
      link: "/portal",
      emailSubject: `[${recipient.ref}] New document available - JDL Core`,
      emailHtml: notifyHtml(
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
  if (!(await requireStaffRole([...OPS_ROLES]))) return initialFail("Unauthorized");
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
    const invoiceSettings = await getInvoiceSettings();
    invoiceNumber = makeInvoiceNumber(inserted[0].id, invoiceSettings.invoicePrefix);
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
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient.clientId,
      email: recipient.email,
      jobId: f.jobId,
      type: "invoice_created",
      title: `Invoice ${invoiceNumber} issued on job ${recipient.ref}`,
      body: `Amount due: ${amountStr}`,
      link: "/portal",
      emailSubject: `[${recipient.ref}] New invoice - JDL Core`,
      emailHtml: notifyHtml(
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

const reminderSchema = z.object({
  invoiceId: z.coerce.number().int().positive(),
  jobId: z.coerce.number().int().positive(),
});

export async function sendInvoiceReminder(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await requireStaffRole([...OPS_ROLES]))) return initialFail("Unauthorized");
  const parsed = reminderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid invoice.");

  const database = requireDb();
  const rows = await database
    .select({ invoice: invoices, clientId: clients.id, email: clients.email, ref: jobs.ref })
    .from(invoices)
    .innerJoin(jobs, eq(invoices.jobId, jobs.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(invoices.id, parsed.data.invoiceId))
    .limit(1);
  const row = rows[0];
  if (!row || row.invoice.jobId !== parsed.data.jobId) return initialFail("Invoice not found.");
  if (row.invoice.status === "paid") return initialFail("This invoice is already paid.");

  const amount = `${row.invoice.currency} ${(row.invoice.amountCents / 100).toLocaleString("en-GH", { minimumFractionDigits: 2 })}`;
  await notifyBoth({
    recipientType: "client",
    recipientId: row.clientId,
    email: row.email,
    jobId: row.invoice.jobId,
    type: "invoice_reminder",
    title: `Reminder: invoice ${row.invoice.number} is outstanding`,
    body: `Amount due: ${amount}`,
    link: "/portal",
    emailSubject: `[${row.ref}] Invoice reminder - JDL Core`,
    emailHtml: notifyHtml(
      `Reminder: invoice ${row.invoice.number} is outstanding`,
      [
        `Amount due: <strong>${amount}</strong>`,
        row.invoice.dueDate
          ? `Due date: ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(row.invoice.dueDate))}.`
          : "Please arrange payment at your earliest convenience.",
        "You can download the invoice PDF from the client portal.",
      ],
      row.ref,
    ),
  });
  return { ok: true, message: "Reminder sent." };
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
  if (!(await requireStaffRole([...OPS_ROLES]))) return { ok: false, message: "Unauthorized" };
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
        status: "awaiting_assignment",
      })
      .returning({ id: jobs.id });
    const jobId = insertedJob[0].id;
    const jobRef = makeRef(jobId);
    await database.update(jobs).set({ ref: jobRef }).where(eq(jobs.id, jobId));
    await database.insert(jobUpdates).values({
      jobId,
      status: "awaiting_assignment",
      note: "Converted from website quote request.",
    });
    await database
      .update(submissions)
      .set({ convertedJobId: jobId })
      .where(eq(submissions.id, f.submissionId));

    revalidatePath("/admin/inbox");
    revalidatePath("/admin/jobs");
    revalidatePath("/admin/clients");

    // Welcome notification for brand-new portal accounts
    let emailSent = false;
    if (clientCreated && tempPassword) {
      await notify({
        recipientType: "client",
        recipientId: clientId,
        jobId,
        type: "portal_account_created",
        title: `Welcome to the JDL Core Client Portal`,
        body: `Your quote request has been converted into job ${jobRef}. Sign in to view it.`,
        link: "/portal",
      });
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
