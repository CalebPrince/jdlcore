"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { requireDb } from "@/db";
import { analyticsUsers, knowledgeDocumentChunks, knowledgeDocuments } from "@/db/schema";
import { chunkDocument, extractDocumentText } from "@/lib/analytics-knowledge";
import { issueSetupToken } from "@/lib/analytics-auth";
import { isEmailConfigured, getEmailConfig, sendNotification } from "@/lib/email";

export type GrantState = {
  ok: boolean;
  message: string;
  setupLink?: string;
  emailed?: boolean;
};

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function deliverInvite(input: {
  email: string;
  name: string;
  link: string;
}): Promise<boolean> {
  const config = await getEmailConfig();
  if (!config.enabled || !isEmailConfigured(config)) return false;
  const result = await sendNotification({
    to: input.email,
    subject: "Your JDL Core Analytics access",
    html: [
      `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2733">`,
      `<div style="background:#081826;padding:18px 24px;border-radius:8px 8px 0 0">`,
      `<strong style="color:#f6cf6e;font-size:15px;letter-spacing:1px">JDL CORE ANALYTICS</strong>`,
      `</div>`,
      `<div style="border:1px solid #e5e2da;border-top:0;padding:24px;border-radius:0 0 8px 8px">`,
      `<h2 style="margin:0 0 12px;font-size:17px">You're in, ${input.name}</h2>`,
      `<p style="margin:0 0 10px;font-size:14px;line-height:1.55">Access to the JDL Core Analytics assistant has been granted to this email.</p>`,
      `<p style="margin:16px 0 0"><a href="${input.link}" style="display:inline-block;background:#c98e12;color:#081826;font-weight:bold;font-size:13px;padding:10px 20px;border-radius:999px;text-decoration:none">Set your password</a></p>`,
      `<p style="margin:18px 0 0;font-size:11px;color:#98a2ad">This link expires in 7 days.</p>`,
      `</div></div>`,
    ].join(""),
  });
  return result.sent;
}

const grantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
});

/** Grants or re-invites one Analytics user. Returns a one-time setup link. */
export async function grantAnalyticsAccess(
  _prev: GrantState,
  formData: FormData,
): Promise<GrantState> {
  if (!(await isAuthenticated())) return { ok: false, message: "Unauthorized" };
  const parsed = grantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Name and a valid email are required." };
  const f = parsed.data;

  let token: string;
  let isNew = false;
  try {
    const database = requireDb();
    const existing = await database
      .select({ id: analyticsUsers.id })
      .from(analyticsUsers)
      .where(eq(analyticsUsers.email, f.email.toLowerCase()))
      .limit(1);
    if (existing[0]) {
      token = await issueSetupToken(existing[0].id);
    } else {
      const inserted = await database
        .insert(analyticsUsers)
        .values({
          name: f.name,
          email: f.email.toLowerCase(),
          company: f.company || null,
          phone: f.phone || null,
          status: "invited",
        })
        .returning({ id: analyticsUsers.id });
      token = await issueSetupToken(inserted[0].id);
      isNew = true;
    }
  } catch (err) {
    console.error("grantAnalyticsAccess:", err);
    return { ok: false, message: "Could not grant access — try again." };
  }

  const link = `${await origin()}/analytics/setup?token=${token}`;
  revalidatePath("/admin/analytics");

  let emailed = false;
  try {
    emailed = await deliverInvite({ email: f.email, name: f.name, link });
  } catch {
    emailed = false;
  }

  return {
    ok: true,
    message: isNew
      ? "Access granted."
      : "Re-invited — previous invite was replaced.",
    setupLink: link,
    emailed,
  };
}

const userIdSchema = z.object({ userId: z.coerce.number().int().positive() });

export async function setAnalyticsUserStatus(formData: FormData): Promise<void> {
  if (!(await isAuthenticated())) return;
  const parsed = userIdSchema.safeParse(Object.fromEntries(formData));
  const status = String(formData.get("status") ?? "");
  if (!parsed.success || !["active", "disabled"].includes(status)) return;
  const database = requireDb();
  await database
    .update(analyticsUsers)
    .set({ status })
    .where(eq(analyticsUsers.id, parsed.data.userId));
  revalidatePath("/admin/analytics");
}

export async function deleteAnalyticsUser(formData: FormData): Promise<void> {
  if (!(await isAuthenticated())) return;
  const parsed = userIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const database = requireDb();
  await database.delete(analyticsUsers).where(eq(analyticsUsers.id, parsed.data.userId));
  revalidatePath("/admin/analytics");
}

export type KnowledgeUploadState = { ok: boolean; message: string };

export async function uploadKnowledgeDocument(
  _prev: KnowledgeUploadState,
  formData: FormData,
): Promise<KnowledgeUploadState> {
  if (!(await isAuthenticated())) return { ok: false, message: "Unauthorized" };
  const file = formData.get("file");
  const requestedTitle = String(formData.get("title") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a document." };
  if (file.size > 8 * 1024 * 1024) return { ok: false, message: "Documents must be 8 MB or smaller." };

  const database = requireDb();
  const title = requestedTitle || file.name.replace(/\.[^.]+$/, "");
  const inserted = await database.insert(knowledgeDocuments).values({
    title,
    scope: "global",
    mimeType: file.type || null,
    sizeBytes: file.size,
    status: "processing",
  }).returning({ id: knowledgeDocuments.id });
  const documentId = inserted[0].id;

  try {
    const chunks = chunkDocument(await extractDocumentText(file));
    if (chunks.length === 0) throw new Error("No readable text was found in this document.");
    await database.insert(knowledgeDocumentChunks).values(
      chunks.map((content, position) => ({ documentId, position, content })),
    );
    await database.update(knowledgeDocuments).set({
      status: "ready",
      processedAt: new Date(),
      error: null,
    }).where(eq(knowledgeDocuments.id, documentId));
    revalidatePath("/admin/analytics");
    return { ok: true, message: `Indexed ${chunks.length} searchable sections from ${file.name}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document processing failed.";
    await database.update(knowledgeDocuments).set({ status: "failed", error: message }).where(eq(knowledgeDocuments.id, documentId));
    revalidatePath("/admin/analytics");
    return { ok: false, message };
  }
}

export async function deleteKnowledgeDocument(formData: FormData): Promise<void> {
  if (!(await isAuthenticated())) return;
  const id = Number(formData.get("documentId"));
  if (!Number.isInteger(id) || id <= 0) return;
  await requireDb().delete(knowledgeDocuments).where(eq(knowledgeDocuments.id, id));
  revalidatePath("/admin/analytics");
}
