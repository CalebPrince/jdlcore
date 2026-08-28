"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { staff } from "@/db/schema";
import { issueStaffSetupToken, requireStaffRole } from "@/lib/staff-auth";
import { getEmailConfig, isEmailConfigured, sendNotification } from "@/lib/email";
import { logAudit } from "@/lib/audit";
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
    subject: "Your JDL Core staff account",
    html: [
      `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2733">`,
      `<div style="background:#081826;padding:18px 24px;border-radius:8px 8px 0 0">`,
      `<strong style="color:#f6cf6e;font-size:15px;letter-spacing:1px">JDL CORE ADMIN</strong>`,
      `</div>`,
      `<div style="border:1px solid #e5e2da;border-top:0;padding:24px;border-radius:0 0 8px 8px">`,
      `<h2 style="margin:0 0 12px;font-size:17px">You're in, ${name}</h2>`,
      `<p style="margin:0 0 10px;font-size:14px;line-height:1.55">A JDL Core staff account has been created for this email.</p>`,
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
  role: z.enum(["operations", "administrator", "superadmin"]),
});

export async function inviteStaff(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the fields and try again." };
  const f = parsed.data;

  let staffId: number;
  try {
    const database = requireDb();
    const existing = await database.select({ id: staff.id }).from(staff).where(eq(staff.email, f.email.toLowerCase())).limit(1);
    if (existing[0]) {
      staffId = existing[0].id;
      await database.update(staff).set({ name: f.name, role: f.role }).where(eq(staff.id, staffId));
    } else {
      const inserted = await database
        .insert(staff)
        .values({ name: f.name, email: f.email.toLowerCase(), role: f.role, status: "invited" })
        .returning({ id: staff.id });
      staffId = inserted[0].id;
    }
  } catch (err) {
    console.error("inviteStaff:", err);
    return { ok: false, message: "Could not create/invite this staff member." };
  }

  const token = await issueStaffSetupToken(staffId);
  const link = `${await origin()}/admin/setup?token=${token}`;
  revalidatePath("/admin/staff");

  await logAudit({
    actor: current,
    action: "staff.invited",
    targetType: "staff",
    targetId: staffId,
    summary: `Invited/updated ${f.name} (${f.email}) as ${f.role}.`,
  });

  let emailed = false;
  try {
    emailed = await deliverInvite(f.email, f.name, link);
  } catch {
    emailed = false;
  }

  return {
    ok: true,
    message: emailed ? `Invite sent to ${f.email}.` : "Staff account created — share this setup link directly.",
    setupLink: link,
    emailed,
  };
}

const toggleSchema = z.object({
  id: z.coerce.number().int().positive(),
  active: z.enum(["true", "false"]),
});

export async function toggleStaffActive(formData: FormData): Promise<void> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return;
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const nextStatus = parsed.data.active === "true" ? "active" : "disabled";
  await requireDb().update(staff).set({ status: nextStatus }).where(eq(staff.id, parsed.data.id));
  revalidatePath("/admin/staff");
  await logAudit({
    actor: current,
    action: nextStatus === "active" ? "staff.enabled" : "staff.disabled",
    targetType: "staff",
    targetId: parsed.data.id,
    summary: `Marked staff #${parsed.data.id} as ${nextStatus}.`,
  });
}

const emailSchema = z.object({
  id: z.coerce.number().int().positive(),
  email: z.string().trim().email().max(200),
});

export async function updateStaffEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  const email = parsed.data.email.toLowerCase();

  try {
    const database = requireDb();
    const existing = await database
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.email, email))
      .limit(1);
    if (existing[0] && existing[0].id !== parsed.data.id) {
      return { ok: false, message: "Another staff account already uses that email." };
    }
    await database.update(staff).set({ email }).where(eq(staff.id, parsed.data.id));
  } catch (err) {
    console.error("updateStaffEmail:", err);
    return { ok: false, message: "Could not update the email." };
  }

  revalidatePath("/admin/staff");
  await logAudit({
    actor: current,
    action: "staff.email_changed",
    targetType: "staff",
    targetId: parsed.data.id,
    summary: `Changed staff #${parsed.data.id}'s email to ${email}.`,
  });
  return { ok: true, message: "Email updated." };
}

const roleSchema = z.object({
  id: z.coerce.number().int().positive(),
  role: z.enum(["operations", "administrator", "superadmin"]),
});

export async function changeStaffRole(_prev: FormState, formData: FormData): Promise<FormState> {
  // Superadmin-only: this can grant the highest privilege level, so it's a
  // stricter gate than the other staff-management actions above.
  const current = await requireStaffRole(["superadmin"]);
  if (!current) return { ok: false, message: "Unauthorized" };
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Invalid role." };
  if (parsed.data.id === current.id) return { ok: false, message: "You can't change your own role." };

  const database = requireDb();
  const target = await database.select().from(staff).where(eq(staff.id, parsed.data.id)).limit(1);
  if (!target[0]) return { ok: false, message: "Staff account not found." };

  if (target[0].role === "superadmin" && parsed.data.role !== "superadmin") {
    const otherSuperadmins = await database
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.role, "superadmin"), eq(staff.status, "active"), ne(staff.id, parsed.data.id)));
    if (otherSuperadmins.length === 0) {
      return { ok: false, message: "Can't change the last super admin's role." };
    }
  }

  await database.update(staff).set({ role: parsed.data.role }).where(eq(staff.id, parsed.data.id));
  revalidatePath("/admin/staff");
  await logAudit({
    actor: current,
    action: "staff.role_changed",
    targetType: "staff",
    targetId: parsed.data.id,
    summary: `Changed ${target[0].name}'s role to ${parsed.data.role}.`,
  });
  return { ok: true, message: "Role updated." };
}

const deleteSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function deleteStaff(formData: FormData): Promise<void> {
  const current = await requireStaffRole(["superadmin"]);
  if (!current) return;
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  if (parsed.data.id === current.id) return;

  const database = requireDb();
  const target = await database.select().from(staff).where(eq(staff.id, parsed.data.id)).limit(1);
  if (!target[0]) return;

  if (target[0].role === "superadmin") {
    const otherSuperadmins = await database
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.role, "superadmin"), eq(staff.status, "active"), ne(staff.id, parsed.data.id)));
    if (otherSuperadmins.length === 0) return;
  }

  await database.delete(staff).where(eq(staff.id, parsed.data.id));
  revalidatePath("/admin/staff");
  await logAudit({
    actor: current,
    action: "staff.deleted",
    targetType: "staff",
    targetId: parsed.data.id,
    summary: `Deleted staff account ${target[0].name} (${target[0].email}).`,
  });
}
