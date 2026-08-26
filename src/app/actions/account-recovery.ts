"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { academyLearners, analyticsUsers, clients, inspectors, passwordResetTokens, staff } from "@/db/schema";
import { sendNotification } from "@/lib/email";
import { hashPassword } from "@/lib/portal-auth";

export type RecoveryState = { ok: boolean; message: string; loginHref?: string };
type AccountType = "academy" | "analytics" | "portal" | "inspector" | "staff";

function digest(token: string) { return createHash("sha256").update(token).digest("hex"); }
async function origin() { const values = await headers(); const host = values.get("x-forwarded-host") ?? values.get("host") ?? "localhost:3000"; const protocol = values.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https"); return `${protocol}://${host}`; }

export async function requestPasswordReset(_previous: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const parsed = z.object({ accountType: z.enum(["academy", "analytics", "portal", "inspector", "staff"]), email: z.string().trim().email().max(200) }).safeParse(Object.fromEntries(formData));
  const generic = { ok: true, message: "If an eligible account uses that email, a reset link has been sent. Check your inbox and spam folder." };
  if (!parsed.success) return { ok: false, message: "Enter a valid email address." };
  const database = requireDb();
  const email = parsed.data.email.toLowerCase();
  let account: { id: number } | undefined;
  if (parsed.data.accountType === "academy") account = (await database.select({ id: academyLearners.id }).from(academyLearners).where(and(eq(academyLearners.email, email), eq(academyLearners.status, "active"))).limit(1))[0];
  if (parsed.data.accountType === "analytics") account = (await database.select({ id: analyticsUsers.id }).from(analyticsUsers).where(and(eq(analyticsUsers.email, email), eq(analyticsUsers.status, "active"))).limit(1))[0];
  if (parsed.data.accountType === "portal") account = (await database.select({ id: clients.id }).from(clients).where(and(eq(clients.email, email), eq(clients.active, true))).limit(1))[0];
  if (parsed.data.accountType === "inspector") account = (await database.select({ id: inspectors.id }).from(inspectors).where(and(eq(inspectors.email, email), eq(inspectors.active, true), eq(inspectors.status, "active"))).limit(1))[0];
  if (parsed.data.accountType === "staff") account = (await database.select({ id: staff.id }).from(staff).where(and(eq(staff.email, email), eq(staff.status, "active"))).limit(1))[0];
  if (!account) return generic;

  const rawToken = randomBytes(32).toString("hex");
  await database.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.accountType, parsed.data.accountType), eq(passwordResetTokens.accountId, account.id), isNull(passwordResetTokens.usedAt)));
  await database.insert(passwordResetTokens).values({ accountType: parsed.data.accountType, accountId: account.id, tokenHash: digest(rawToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
  const link = `${await origin()}/account/reset-password?token=${rawToken}`;
  await sendNotification({
    to: email,
    subject: "Reset your JDL Core password",
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1a2733"><div style="background:#081826;padding:20px 24px;color:#f6cf6e;font-weight:bold">JDL CORE ACCOUNT RECOVERY</div><div style="border:1px solid #e5e2da;border-top:0;padding:24px"><h2 style="margin-top:0">Reset your password</h2><p>This one-time link expires in one hour.</p><p><a href="${link}" style="display:inline-block;background:#c98e12;color:#081826;font-weight:bold;padding:11px 20px;border-radius:999px;text-decoration:none">Choose a new password</a></p><p style="font-size:12px;color:#687480">If you did not request this, you can ignore this email.</p></div></div>`,
  });
  return generic;
}

export async function resetPassword(_previous: RecoveryState, formData: FormData): Promise<RecoveryState> {
  const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(8).max(200), confirmPassword: z.string().min(8).max(200) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success || parsed.data.password !== parsed.data.confirmPassword) return { ok: false, message: "Use matching passwords of at least 8 characters." };
  const database = requireDb();
  const row = (await database.select().from(passwordResetTokens).where(and(eq(passwordResetTokens.tokenHash, digest(parsed.data.token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date()))).limit(1))[0];
  if (!row) return { ok: false, message: "This reset link is invalid, expired, or has already been used." };
  const passwordHash = hashPassword(parsed.data.password);
  const accountType = row.accountType as AccountType;
  await database.transaction(async (tx) => {
    if (accountType === "academy") await tx.update(academyLearners).set({ passwordHash }).where(eq(academyLearners.id, row.accountId));
    else if (accountType === "analytics") await tx.update(analyticsUsers).set({ passwordHash }).where(eq(analyticsUsers.id, row.accountId));
    else if (accountType === "portal") await tx.update(clients).set({ passwordHash }).where(eq(clients.id, row.accountId));
    else if (accountType === "inspector") await tx.update(inspectors).set({ passwordHash }).where(eq(inspectors.id, row.accountId));
    else if (accountType === "staff") await tx.update(staff).set({ passwordHash }).where(eq(staff.id, row.accountId));
    else throw new Error("Unsupported account type");
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(and(eq(passwordResetTokens.accountType, row.accountType), eq(passwordResetTokens.accountId, row.accountId), isNull(passwordResetTokens.usedAt)));
  });
  const loginHref =
    accountType === "academy"
      ? "/academy/login"
      : accountType === "analytics"
        ? "/analytics/login"
        : accountType === "inspector"
          ? "/inspector/login"
          : accountType === "staff"
            ? "/admin/login"
            : "/portal/login";
  return { ok: true, message: "Password updated. You can now sign in with your new password.", loginHref };
}
