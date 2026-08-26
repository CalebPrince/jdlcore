"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { inspectors } from "@/db/schema";
import { issueInspectorSetupToken } from "@/lib/inspector-auth";
import { requireStaffRole } from "@/lib/staff-auth";
import { getEmailConfig, isEmailConfigured, sendNotification } from "@/lib/email";
import type { FormState } from "./submissions";

const ADMIN_ROLES = ["administrator", "superadmin"] as const;

export type InviteState = FormState & { setupLink?: string; emailed?: boolean };

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function deliverInvite(email: string, name: string, link: string): Promise<boolean> {
  const config = await getEmailConfig();
  if (!config.enabled || !isEmailConfigured(config)) return false;
  const result = await sendNotification({
    to: email,
    subject: "Your JDL Core Inspector account",
    html: [
      `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2733">`,
      `<div style="background:#081826;padding:18px 24px;border-radius:8px 8px 0 0">`,
      `<strong style="color:#f6cf6e;font-size:15px;letter-spacing:1px">JDL CORE INSPECTOR PORTAL</strong>`,
      `</div>`,
      `<div style="border:1px solid #e5e2da;border-top:0;padding:24px;border-radius:0 0 8px 8px">`,
      `<h2 style="margin:0 0 12px;font-size:17px">You're in, ${name}</h2>`,
      `<p style="margin:0 0 10px;font-size:14px;line-height:1.55">An inspector account has been created for this email.</p>`,
      `<p style="margin:16px 0 0"><a href="${link}" style="display:inline-block;background:#c98e12;color:#081826;font-weight:bold;font-size:13px;padding:10px 20px;border-radius:999px;text-decoration:none">Set your password</a></p>`,
      `<p style="margin:18px 0 0;font-size:11px;color:#98a2ad">This link expires in 7 days.</p>`,
      `</div></div>`,
    ].join(""),
  });
  return result.sent;
}

const inviteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
});

export async function inviteInspector(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the fields and try again." };
  const f = parsed.data;

  let inspectorId: number;
  try {
    const database = requireDb();
    const existing = await database
      .select({ id: inspectors.id })
      .from(inspectors)
      .where(eq(inspectors.email, f.email.toLowerCase()))
      .limit(1);
    if (existing[0]) {
      inspectorId = existing[0].id;
      await database.update(inspectors).set({ name: f.name, phone: f.phone || null }).where(eq(inspectors.id, inspectorId));
    } else {
      const inserted = await database
        .insert(inspectors)
        .values({ name: f.name, email: f.email.toLowerCase(), phone: f.phone || null, status: "invited", active: true })
        .returning({ id: inspectors.id });
      inspectorId = inserted[0].id;
    }
  } catch (err) {
    console.error("inviteInspector:", err);
    return { ok: false, message: "Could not create/invite this inspector." };
  }

  const token = await issueInspectorSetupToken(inspectorId);
  const link = `${await origin()}/inspector/setup?token=${token}`;
  revalidatePath("/admin/inspectors");

  let emailed = false;
  try {
    emailed = await deliverInvite(f.email, f.name, link);
  } catch {
    emailed = false;
  }

  return {
    ok: true,
    message: emailed ? `Invite sent to ${f.email}.` : "Inspector account created — share this setup link directly.",
    setupLink: link,
    emailed,
  };
}

const toggleSchema = z.object({
  id: z.coerce.number().int().positive(),
  active: z.enum(["true", "false"]),
});

export async function toggleInspectorActive(formData: FormData): Promise<void> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return;
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  await requireDb()
    .update(inspectors)
    .set({ active: parsed.data.active === "true" })
    .where(eq(inspectors.id, parsed.data.id));
  revalidatePath("/admin/inspectors");
}
