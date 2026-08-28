"use server";

import { revalidatePath } from "next/cache";
import { eq, ne, and } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { staff } from "@/db/schema";
import { getStaff, hashPassword, verifyPassword } from "@/lib/staff-auth";
import { logAudit } from "@/lib/audit";
import type { FormState } from "./submissions";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
});

export async function updateMyAccount(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await getStaff();
  if (!current) return { ok: false, message: "Unauthorized" };
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter a valid name and email address." };
  const email = parsed.data.email.toLowerCase();

  try {
    const database = requireDb();
    const existing = await database
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.email, email), ne(staff.id, current.id)))
      .limit(1);
    if (existing[0]) return { ok: false, message: "Another account already uses that email." };

    await database.update(staff).set({ name: parsed.data.name, email }).where(eq(staff.id, current.id));
  } catch (err) {
    console.error("updateMyAccount:", err);
    return { ok: false, message: "Could not update your account." };
  }

  revalidatePath("/admin/account");
  await logAudit({
    actor: { ...current, name: parsed.data.name },
    action: "staff.self_profile_updated",
    targetType: "staff",
    targetId: current.id,
    summary: `Updated their own profile — name: ${parsed.data.name}, email: ${email}.`,
  });
  return { ok: true, message: "Account details updated." };
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: "New passwords don't match." });

export async function changeMyPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await getStaff();
  if (!current) return { ok: false, message: "Unauthorized" };
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Use matching passwords of at least 8 characters." };
  }

  if (!current.passwordHash || !verifyPassword(parsed.data.currentPassword, current.passwordHash)) {
    return { ok: false, message: "Current password is incorrect." };
  }

  const database = requireDb();
  await database.update(staff).set({ passwordHash: hashPassword(parsed.data.newPassword) }).where(eq(staff.id, current.id));
  await logAudit({
    actor: current,
    action: "staff.self_password_changed",
    targetType: "staff",
    targetId: current.id,
    summary: `${current.name} changed their own password.`,
  });
  return { ok: true, message: "Password updated." };
}
