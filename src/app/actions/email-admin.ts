"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import {
  getEmailConfig,
  isEmailConfigured,
  saveEmailConfig,
  sendNotification,
} from "@/lib/email";
import type { FormState } from "./submissions";

const schema = z.object({
  enabled: z.string().optional(),
  resendKey: z.string().max(400).optional(),
  clearResendKey: z.string().optional(),
  smtpHost: z.string().max(200).optional(),
  smtpPort: z.string().max(6).optional(),
  smtpUser: z.string().max(200).optional(),
  smtpPass: z.string().max(400).optional(),
  clearSmtpPass: z.string().optional(),
  fromAddress: z.string().max(200).optional(),
  fromName: z.string().max(120).optional(),
});

export async function saveEmailSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAuthenticated())) return { ok: false, message: "Unauthorized" };
  const f = schema.safeParse(Object.fromEntries(formData));
  if (!f.success) return { ok: false, message: "Invalid values." };
  const v = f.data;

  try {
    await saveEmailConfig({
      enabled: v.enabled === "on",
      resendKey: v.resendKey,
      clearResendKey: v.clearResendKey === "on",
      smtpHost: v.smtpHost ?? undefined,
      smtpPort:
        v.smtpPort !== undefined && v.smtpPort !== ""
          ? Number(v.smtpPort)
          : undefined,
      smtpUser: v.smtpUser,
      smtpPass: v.smtpPass,
      clearSmtpPass: v.clearSmtpPass === "on",
      fromAddress: v.fromAddress ?? undefined,
      fromName: v.fromName ?? undefined,
    });
  } catch (err) {
    console.error("saveEmailSettings:", err);
    return { ok: false, message: "Could not save email settings." };
  }
  revalidatePath("/admin/email");
  return { ok: true, message: "Email settings saved." };
}

export async function sendTestEmail(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAuthenticated())) return { ok: false, message: "Unauthorized" };
  const to = String(formData.get("to") ?? "").trim();
  if (!to.includes("@")) return { ok: false, message: "Enter a valid recipient." };

  const config = await getEmailConfig();
  if (!isEmailConfigured(config)) {
    return { ok: false, message: "No provider configured yet — add a Resend key or SMTP details first." };
  }

  const result = await sendNotification({
    to,
    subject: "JDL Core test notification",
    html: "<p>This is a test notification from the JDL Core client portal.</p>",
  });
  revalidatePath("/admin/email");
  return result.sent
    ? { ok: true, message: `Test email sent to ${to}.` }
    : { ok: false, message: "Send failed — check the delivery log below." };
}
