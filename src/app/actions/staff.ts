"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { staff } from "@/db/schema";
import {
  createStaffSession,
  destroyStaffSession,
  hashPassword,
  verifyPassword,
  verifyStaffSetupToken,
} from "@/lib/staff-auth";

export type StaffLoginState = { ok: boolean; message: string };

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1, "Enter your password."),
});

export async function staffLogin(
  _prev: StaffLoginState,
  formData: FormData,
): Promise<StaffLoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid email and password." };
  }
  const { email, password } = parsed.data;

  let row;
  try {
    const database = requireDb();
    const rows = await database
      .select()
      .from(staff)
      .where(eq(staff.email, email.toLowerCase()))
      .limit(1);
    row = rows[0];
  } catch {
    return { ok: false, message: "Could not reach the database." };
  }

  if (!row || row.status !== "active" || !row.passwordHash) {
    return { ok: false, message: "Incorrect email or password." };
  }
  if (!verifyPassword(password, row.passwordHash)) {
    return { ok: false, message: "Incorrect email or password." };
  }

  await createStaffSession(row.id);
  await requireDb()
    .update(staff)
    .set({ lastLoginAt: new Date() })
    .where(eq(staff.id, row.id));
  redirect("/admin");
}

export async function staffLogout(): Promise<void> {
  await destroyStaffSession();
  redirect("/admin/login");
}

const setupSchema = z.object({
  token: z.string().trim().max(96),
  password: z.string().min(8).max(200),
});

export async function completeStaffSetup(
  _prev: StaffLoginState,
  formData: FormData,
): Promise<StaffLoginState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Password must be at least 8 characters." };

  const row = await verifyStaffSetupToken(parsed.data.token);
  if (!row) {
    return { ok: false, message: "This invite link is invalid or has expired. Ask an administrator for a fresh one." };
  }

  try {
    const database = requireDb();
    await database
      .update(staff)
      .set({
        passwordHash: hashPassword(parsed.data.password),
        status: "active",
        setupToken: null,
        setupTokenExpires: null,
        lastLoginAt: new Date(),
      })
      .where(eq(staff.id, row.id));
    await createStaffSession(row.id);
  } catch (err) {
    console.error("completeStaffSetup:", err);
    return { ok: false, message: "Could not finish setup. Try again shortly." };
  }
  redirect("/admin");
}
