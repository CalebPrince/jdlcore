"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { analyticsUsers } from "@/db/schema";
import {
  createAnalyticsSession,
  destroyAnalyticsSession,
  verifySetupToken,
} from "@/lib/analytics-auth";
import { verifyPassword, hashPassword } from "@/lib/portal-auth";
import type { FormState } from "./submissions";

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export async function analyticsLogin(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter your email and password." };

  let result: FormState = {
    ok: false,
    message: "Invalid email or password.",
  };
  try {
    const database = requireDb();
    const rows = await database
      .select()
      .from(analyticsUsers)
      .where(eq(analyticsUsers.email, parsed.data.email.toLowerCase()))
      .limit(1);
    const user = rows[0];
    if (
      !user ||
      user.status !== "active" ||
      !user.passwordHash ||
      !verifyPassword(parsed.data.password, user.passwordHash)
    ) {
      return result;
    }
    await database
      .update(analyticsUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(analyticsUsers.id, user.id));
    await createAnalyticsSession(user.id);
    result = { ok: true, message: "Signed in." };
  } catch (err) {
    console.error("analyticsLogin:", err);
    result = { ok: false, message: "Could not sign in right now. Try again shortly." };
  }
  if (result.ok) redirect("/analytics/app");
  return result;
}

const setupSchema = z.object({
  token: z.string().trim().max(96),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(200),
});

export async function completeSetup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Password must be at least 8 characters.",
    };
  }

  const user = await verifySetupToken(parsed.data.token);
  if (!user) {
    return {
      ok: false,
      message: "This invite link is invalid or has expired. Ask JDL Core for a fresh one.",
    };
  }

  try {
    const database = requireDb();
    await database
      .update(analyticsUsers)
      .set({
        name: parsed.data.name,
        passwordHash: hashPassword(parsed.data.password),
        status: "active",
        setupToken: null,
        setupTokenExpires: null,
        lastLoginAt: new Date(),
      })
      .where(eq(analyticsUsers.id, user.id));
    await createAnalyticsSession(user.id);
  } catch (err) {
    console.error("completeSetup:", err);
    return { ok: false, message: "Could not finish setup. Try again shortly." };
  }
  redirect("/analytics/app");
}

export async function analyticsLogout(): Promise<void> {
  await destroyAnalyticsSession();
  redirect("/analytics/login");
}
