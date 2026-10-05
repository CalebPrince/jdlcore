"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { inspectorAssignmentProfiles, inspectors, jobs } from "@/db/schema";
import { SERVICE_TYPES } from "@/lib/jobs";
import { issueInspectorSetupToken } from "@/lib/inspector-auth";
import { requireStaffRole } from "@/lib/staff-auth";
import { getEmailConfig, isEmailConfigured, sendNotification } from "@/lib/email";
import { notify } from "@/lib/notifications";
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

  // Optional assignment profile, set at invite time so the inspector is never left invisible to
  // auto-assignment. Only written when at least one service is ticked, so re-inviting an existing
  // inspector never wipes the profile they already have.
  const wantsProfile = formData.getAll("serviceTypes").length > 0;
  let profileFields: ProfileFields | null = null;
  if (wantsProfile) {
    const parsedProfile = profileFieldsSchema.safeParse({
      regions: formData.get("regions") ?? undefined,
      maxOpenJobs: formData.get("maxOpenJobs") ?? 3,
      unavailableUntil: undefined,
      autoAssignEnabled: formData.get("autoAssignEnabled") ?? undefined,
    });
    if (!parsedProfile.success) return { ok: false, message: "Check the assignment settings and try again." };
    const read = readProfileFields(formData, parsedProfile.data);
    if (!read.ok) return { ok: false, message: read.message };
    profileFields = read.fields;
  }

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

  if (profileFields) {
    try {
      await upsertAssignmentProfile(inspectorId, profileFields);
    } catch (err) {
      console.error("inviteInspector profile:", err);
      return {
        ok: false,
        message: "The inspector was created, but their assignment settings could not be saved. Open their Assignment profile below and save it.",
      };
    }
  }

  const token = await issueInspectorSetupToken(inspectorId);
  const link = `${await origin()}/inspector/setup?token=${token}`;
  revalidatePath("/admin/inspectors");

  await logAudit({
    actor: current,
    action: "inspector.invited",
    targetType: "inspector",
    targetId: inspectorId,
    summary: `Invited/updated ${f.name} (${f.email}) as inspector${profileFields ? ` (auto-assign ${profileFields.autoAssignEnabled ? "on" : "off"}, ${profileFields.serviceTypes.length} service(s))` : ""}.`,
  });

  await notify({
    recipientType: "inspector",
    recipientId: inspectorId,
    type: "inspector_invited",
    title: `You're in, ${f.name}`,
    body: "An inspector account has been created for you. Sign in to set your password.",
    link: "/inspector",
  });

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

const emailSchema = z.object({
  id: z.coerce.number().int().positive(),
  email: z.string().trim().email().max(200),
});

export async function updateInspectorEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };
  const parsed = emailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  const email = parsed.data.email.toLowerCase();

  try {
    const database = requireDb();
    const existing = await database
      .select({ id: inspectors.id })
      .from(inspectors)
      .where(eq(inspectors.email, email))
      .limit(1);
    if (existing[0] && existing[0].id !== parsed.data.id) {
      return { ok: false, message: "Another inspector account already uses that email." };
    }
    await database.update(inspectors).set({ email }).where(eq(inspectors.id, parsed.data.id));
  } catch (err) {
    console.error("updateInspectorEmail:", err);
    return { ok: false, message: "Could not update the email." };
  }

  revalidatePath("/admin/inspectors");
  await logAudit({
    actor: current,
    action: "inspector.email_changed",
    targetType: "inspector",
    targetId: parsed.data.id,
    summary: `Changed inspector #${parsed.data.id}'s email to ${email}.`,
  });
  return { ok: true, message: "Email updated." };
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
  const nextActive = parsed.data.active === "true";
  await requireDb().update(inspectors).set({ active: nextActive }).where(eq(inspectors.id, parsed.data.id));
  revalidatePath("/admin/inspectors");
  await logAudit({
    actor: current,
    action: nextActive ? "inspector.enabled" : "inspector.disabled",
    targetType: "inspector",
    targetId: parsed.data.id,
    summary: `Marked inspector #${parsed.data.id} as ${nextActive ? "available" : "unavailable"}.`,
  });
}

const deleteSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function deleteInspector(formData: FormData): Promise<void> {
  const current = await requireStaffRole(["superadmin"]);
  if (!current) return;
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  const database = requireDb();
  const target = await database.select().from(inspectors).where(eq(inspectors.id, parsed.data.id)).limit(1);
  if (!target[0]) return;

  const openJobs = await database
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.assignedInspectorId, parsed.data.id), ne(jobs.status, "closed")))
    .limit(1);
  if (openJobs.length > 0) return;

  await database.delete(inspectors).where(eq(inspectors.id, parsed.data.id));
  revalidatePath("/admin/inspectors");
  await logAudit({
    actor: current,
    action: "inspector.deleted",
    targetType: "inspector",
    targetId: parsed.data.id,
    summary: `Deleted inspector account ${target[0].name} (${target[0].email}).`,
  });
}

/* ---------------- Assignment profile (used by auto-assignment) ---------------- */

const profileFieldsSchema = z.object({
  regions: z.string().max(600).optional(),
  maxOpenJobs: z.coerce.number().int().min(1).max(20),
  unavailableUntil: z.string().optional(),
  autoAssignEnabled: z.string().optional(),
});

const profileSchema = profileFieldsSchema.extend({
  inspectorId: z.coerce.number().int().positive(),
});

type ProfileFields = {
  regions: string[];
  serviceTypes: string[];
  maxOpenJobs: number;
  unavailableUntil: Date | null;
  autoAssignEnabled: boolean;
};

/** Reads the assignment-profile fields shared by the invite form and the profile form. */
function readProfileFields(
  formData: FormData,
  data: z.infer<typeof profileFieldsSchema>,
): { ok: true; fields: ProfileFields } | { ok: false; message: string } {
  const serviceTypes = formData
    .getAll("serviceTypes")
    .map(String)
    .filter((s) => (SERVICE_TYPES as readonly string[]).includes(s));
  const regions = [
    ...new Set(
      (data.regions ?? "")
        .split(/[,\n]/)
        .map((r) => r.trim())
        .filter(Boolean),
    ),
  ].slice(0, 30);
  const enabled = data.autoAssignEnabled === "on";
  if (enabled && serviceTypes.length === 0) {
    return { ok: false, message: "Pick at least one service this inspector is qualified for before switching them on." };
  }
  const away = data.unavailableUntil ? new Date(`${data.unavailableUntil}T00:00:00.000Z`) : null;
  if (away && Number.isNaN(away.getTime())) return { ok: false, message: "That date isn't valid." };
  return {
    ok: true,
    fields: { regions, serviceTypes, maxOpenJobs: data.maxOpenJobs, unavailableUntil: away, autoAssignEnabled: enabled },
  };
}

async function upsertAssignmentProfile(inspectorId: number, f: ProfileFields): Promise<void> {
  const values = { inspectorId, ...f, updatedAt: new Date() };
  await requireDb()
    .insert(inspectorAssignmentProfiles)
    .values(values)
    .onConflictDoUpdate({ target: inspectorAssignmentProfiles.inspectorId, set: values });
}

export async function saveInspectorAssignmentProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the numbers and dates entered." };

  const read = readProfileFields(formData, parsed.data);
  if (!read.ok) return { ok: false, message: read.message };
  const { fields } = read;

  try {
    await upsertAssignmentProfile(parsed.data.inspectorId, fields);
  } catch {
    return {
      ok: false,
      message: "Could not save the assignment profile. Please try again.",
    };
  }
  revalidatePath("/admin/inspectors");
  await logAudit({
    actor: current,
    action: "inspector.assignment_profile_updated",
    targetType: "inspector",
    targetId: parsed.data.inspectorId,
    summary: `Updated assignment profile for inspector #${parsed.data.inspectorId} (auto-assign ${fields.autoAssignEnabled ? "on" : "off"}, ${fields.serviceTypes.length} service(s), ${fields.regions.length} region(s), max ${fields.maxOpenJobs} open).`,
  });
  return { ok: true, message: "Assignment profile saved." };
}
