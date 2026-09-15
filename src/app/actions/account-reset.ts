"use server";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { academyLearners, analyticsUsers, clients, inspectors, passwordResetTokens, staff } from "@/db/schema";
import { requireStaffRole } from "@/lib/staff-auth";
import { hashPassword } from "@/lib/portal-auth";
import { getEmailConfig, isEmailConfigured, sendNotification } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import type { AccountType } from "@/lib/account-directory";

const ACCOUNT_TYPES = ["academy", "analytics", "portal", "inspector", "staff"] as const;

const inputSchema = z.object({
  mode: z.enum(["link", "password"]),
  emailPassword: z.boolean(),
  targets: z
    .array(z.object({ accountType: z.enum(ACCOUNT_TYPES), id: z.number().int().positive() }))
    .min(1)
    .max(500),
});

export type ResetAccountsResult = {
  accountType: AccountType;
  id: number;
  name: string;
  email: string;
  generatedPassword?: string;
  emailed?: boolean;
  fallbackLink?: string;
};

export type ResetAccountsState = {
  ok: boolean;
  message: string;
  mode?: "link" | "password";
  results?: ResetAccountsResult[];
  skippedSelf?: boolean;
};

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function origin(): Promise<string> {
  const values = await headers();
  const host = values.get("x-forwarded-host") ?? values.get("host") ?? "localhost:3000";
  const protocol = values.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

function generatePassword(): string {
  return randomBytes(12).toString("base64url");
}

type Db = ReturnType<typeof requireDb>;

async function findAccount(database: Db, accountType: AccountType, id: number) {
  if (accountType === "academy") {
    return (await database.select({ id: academyLearners.id, name: academyLearners.name, email: academyLearners.email }).from(academyLearners).where(eq(academyLearners.id, id)).limit(1))[0];
  }
  if (accountType === "analytics") {
    return (await database.select({ id: analyticsUsers.id, name: analyticsUsers.name, email: analyticsUsers.email }).from(analyticsUsers).where(eq(analyticsUsers.id, id)).limit(1))[0];
  }
  if (accountType === "portal") {
    return (await database.select({ id: clients.id, name: clients.name, email: clients.email }).from(clients).where(eq(clients.id, id)).limit(1))[0];
  }
  if (accountType === "inspector") {
    return (await database.select({ id: inspectors.id, name: inspectors.name, email: inspectors.email }).from(inspectors).where(eq(inspectors.id, id)).limit(1))[0];
  }
  return (await database.select({ id: staff.id, name: staff.name, email: staff.email }).from(staff).where(eq(staff.id, id)).limit(1))[0];
}

async function setPasswordHash(database: Db, accountType: AccountType, id: number, passwordHash: string): Promise<void> {
  if (accountType === "academy") await database.update(academyLearners).set({ passwordHash }).where(eq(academyLearners.id, id));
  else if (accountType === "analytics") await database.update(analyticsUsers).set({ passwordHash }).where(eq(analyticsUsers.id, id));
  else if (accountType === "portal") await database.update(clients).set({ passwordHash }).where(eq(clients.id, id));
  else if (accountType === "inspector") await database.update(inspectors).set({ passwordHash }).where(eq(inspectors.id, id));
  else await database.update(staff).set({ passwordHash }).where(eq(staff.id, id));
}

export async function resetAccounts(
  _prev: ResetAccountsState,
  formData: FormData,
): Promise<ResetAccountsState> {
  const current = await requireStaffRole(["superadmin"]);
  if (!current) return { ok: false, message: "Unauthorized" };

  let parsedTargets: unknown;
  try {
    parsedTargets = JSON.parse(String(formData.get("targets") ?? "[]"));
  } catch {
    return { ok: false, message: "Invalid selection." };
  }

  const parsed = inputSchema.safeParse({ mode: formData.get("mode"), emailPassword: formData.get("emailPassword") === "on", targets: parsedTargets });
  if (!parsed.success) return { ok: false, message: "Select at least one account." };

  const database = requireDb();
  const { mode } = parsed.data;
  const results: ResetAccountsResult[] = [];
  let skippedSelf = false;

  const emailConfig = await getEmailConfig();
  const canEmail = emailConfig.enabled && isEmailConfigured(emailConfig);
  const requestOrigin = await origin();

  for (const target of parsed.data.targets) {
    if (target.accountType === "staff" && target.id === current.id) {
      skippedSelf = true;
      continue;
    }

    const account = await findAccount(database, target.accountType, target.id);
    if (!account) continue;

    // Invalidate any outstanding reset tokens for this account either way.
    await database
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.accountType, target.accountType),
          eq(passwordResetTokens.accountId, account.id),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    if (mode === "password") {
      const newPassword = generatePassword();
      const passwordHash = hashPassword(newPassword);
      await setPasswordHash(database, target.accountType, account.id, passwordHash);
      let emailed = false;
      if (parsed.data.emailPassword && canEmail) {
        try {
          const sent = await sendNotification({
            to: account.email,
            subject: "Your new JDL Core password",
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1a2733"><div style="background:#081826;padding:20px 24px;color:#f6cf6e;font-weight:bold">JDL CORE ACCOUNT ACCESS</div><div style="border:1px solid #e5e2da;border-top:0;padding:24px"><h2 style="margin-top:0">Your password was reset</h2><p>A JDL Core superadmin generated a new password for your account.</p><p style="font-size:18px"><strong>${newPassword}</strong></p><p>Sign in and change this password from your account settings as soon as possible.</p></div></div>`,
          });
          emailed = sent.sent;
        } catch { emailed = false; }
      }
      results.push({
        accountType: target.accountType,
        id: account.id,
        name: account.name,
        email: account.email,
        generatedPassword: newPassword,
        emailed,
      });
      await logAudit({
        actor: current,
        action: "account.password_reset",
        targetType: "account",
        targetId: account.id,
        summary: `Reset password for ${target.accountType} account ${account.name} (${account.email})${emailed ? " and emailed it" : ""}.`,
      });
    } else {
      const rawToken = randomBytes(32).toString("hex");
      await database.insert(passwordResetTokens).values({
        accountType: target.accountType,
        accountId: account.id,
        tokenHash: digest(rawToken),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      const link = `${requestOrigin}/account/reset-password?token=${rawToken}`;

      let emailed = false;
      if (canEmail) {
        try {
          const sent = await sendNotification({
            to: account.email,
            subject: "Reset your JDL Core password",
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1a2733"><div style="background:#081826;padding:20px 24px;color:#f6cf6e;font-weight:bold">JDL CORE ACCOUNT RECOVERY</div><div style="border:1px solid #e5e2da;border-top:0;padding:24px"><h2 style="margin-top:0">Reset your password</h2><p>A JDL Core administrator triggered a password reset for your account. This one-time link expires in one hour.</p><p><a href="${link}" style="display:inline-block;background:#c98e12;color:#081826;font-weight:bold;padding:11px 20px;border-radius:999px;text-decoration:none">Choose a new password</a></p></div></div>`,
          });
          emailed = sent.sent;
        } catch {
          emailed = false;
        }
      }

      results.push({
        accountType: target.accountType,
        id: account.id,
        name: account.name,
        email: account.email,
        emailed,
        fallbackLink: emailed ? undefined : link,
      });
      await logAudit({
        actor: current,
        action: "account.reset_link_sent",
        targetType: "account",
        targetId: account.id,
        summary: `Sent a password reset link for ${target.accountType} account ${account.name} (${account.email}).`,
      });
    }
  }

  if (results.length === 0) {
    return {
      ok: false,
      message: skippedSelf ? "You can't reset your own account here." : "No matching accounts found.",
      skippedSelf,
    };
  }

  return {
    ok: true,
    message:
      mode === "password"
        ? `Set a new password for ${results.length} account${results.length === 1 ? "" : "s"}${parsed.data.emailPassword ? "; email delivery was attempted" : ""}.`
        : `Sent reset links for ${results.length} account${results.length === 1 ? "" : "s"}.`,
    mode,
    results,
    skippedSelf,
  };
}
