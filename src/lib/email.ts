import "server-only";
import { desc, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { requireDb } from "@/db";
import { emailLog, settings } from "@/db/schema";

export type EmailConfig = {
  resendKey: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  fromAddress: string;
  fromName: string;
  enabled: boolean;
};

const KEYS = {
  resendKey: "email_resend_key",
  smtpHost: "email_smtp_host",
  smtpPort: "email_smtp_port",
  smtpUser: "email_smtp_user",
  smtpPass: "email_smtp_pass",
  fromAddress: "email_from_address",
  fromName: "email_from_name",
  enabled: "email_enabled",
} as const;

export const DEFAULT_FROM = "notifications@jdlcore.com";
export const DEFAULT_FROM_NAME = "JDL Core";

export async function getEmailConfig(): Promise<EmailConfig> {
  let rows: { key: string; value: string }[] = [];
  try {
    const database = requireDb();
    rows = await database
      .select({ key: settings.key, value: settings.value })
      .from(settings);
  } catch {
    return fallback();
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return build(map);
}

function fallback(): EmailConfig {
  return {
    resendKey: process.env.RESEND_API_KEY ?? null,
    smtpHost: null,
    smtpPort: null,
    smtpUser: null,
    smtpPass: null,
    fromAddress: DEFAULT_FROM,
    fromName: DEFAULT_FROM_NAME,
    enabled: true,
  };
}

function build(map: Map<string, string>): EmailConfig {
  const get = (k: string): string | null => {
    const v = map.get(k);
    return v && v.trim() ? v.trim() : null;
  };
  const portStr = map.get(KEYS.smtpPort);
  return {
    resendKey:
      get(KEYS.resendKey) ?? (process.env.RESEND_API_KEY || null),
    smtpHost: get(KEYS.smtpHost),
    smtpPort: portStr ? Number(portStr) : null,
    smtpUser: get(KEYS.smtpUser),
    smtpPass: get(KEYS.smtpPass),
    fromAddress: get(KEYS.fromAddress) ?? DEFAULT_FROM,
    fromName: get(KEYS.fromName) ?? DEFAULT_FROM_NAME,
    enabled: !(map.get(KEYS.enabled) === "0"),
  };
}

export function isEmailConfigured(c: EmailConfig): boolean {
  return Boolean(c.resendKey || c.smtpHost);
}

export async function saveEmailConfig(values: {
  resendKey?: string | null;
  clearResendKey?: boolean;
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUser?: string | null;
  smtpPass?: string | null;
  clearSmtpPass?: boolean;
  fromAddress?: string | null;
  fromName?: string | null;
  enabled?: boolean;
}): Promise<void> {
  const database = requireDb();
  const upserts: { key: string; value: string }[] = [];
  const push = (key: string, value: string) => upserts.push({ key, value });

  if (values.clearResendKey) push(KEYS.resendKey, "");
  else if (values.resendKey?.trim()) push(KEYS.resendKey, values.resendKey.trim());
  if (values.smtpHost !== undefined)
    push(KEYS.smtpHost, values.smtpHost?.trim() ?? "");
  if (values.smtpPort !== undefined && values.smtpPort !== null)
    push(KEYS.smtpPort, String(values.smtpPort));
  if (values.smtpUser !== undefined)
    push(KEYS.smtpUser, values.smtpUser?.trim() ?? "");
  if (values.clearSmtpPass) push(KEYS.smtpPass, "");
  else if (values.smtpPass?.trim()) push(KEYS.smtpPass, values.smtpPass.trim());
  if (values.fromAddress !== undefined && values.fromAddress?.trim())
    push(KEYS.fromAddress, values.fromAddress.trim());
  if (values.fromName !== undefined && values.fromName?.trim())
    push(KEYS.fromName, values.fromName.trim());
  if (values.enabled !== undefined) push(KEYS.enabled, values.enabled ? "1" : "0");

  if (upserts.length === 0) return;
  await database
    .insert(settings)
    .values(upserts)
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value`, updatedAt: new Date() },
    });
}

async function logEmail(row: {
  toEmail: string;
  subject: string;
  provider: string;
  status: string;
  error?: string | null;
}): Promise<void> {
  try {
    await requireDb().insert(emailLog).values(row);
  } catch {
    /* logging must never break the action */
  }
}

/** Sends an email via the configured provider. Never throws; result is logged to email_log. */
export async function sendNotification(input: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean }> {
  let config: EmailConfig;
  try {
    config = await getEmailConfig();
  } catch {
    return { sent: false };
  }

  const from = `${config.fromName} <${config.fromAddress}>`;

  if (!config.enabled || !isEmailConfigured(config)) {
    await logEmail({
      toEmail: input.to,
      subject: input.subject,
      provider: "skipped",
      status: config.enabled ? "skipped" : "failed",
      error: config.enabled ? "No email provider configured" : "Notifications disabled",
    });
    return { sent: false };
  }

  if (config.resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.resendKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [input.to],
          subject: input.subject,
          html: input.html,
        }),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const body = (await res.json()) as { message?: string };
          detail = body.message ? ` — ${body.message}` : "";
        } catch {
          /* body wasn't JSON; fall back to the bare status */
        }
        throw new Error(`Resend ${res.status}${detail}`);
      }
      await logEmail({ toEmail: input.to, subject: input.subject, provider: "resend", status: "sent" });
      return { sent: true };
    } catch (err) {
      await logEmail({
        toEmail: input.to,
        subject: input.subject,
        provider: "resend",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      return { sent: false };
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: config.smtpHost!,
      port: config.smtpPort ?? 587,
      secure: (config.smtpPort ?? 587) === 465,
      auth: config.smtpUser
        ? { user: config.smtpUser, pass: config.smtpPass ?? "" }
        : undefined,
    });
    await transporter.sendMail({ from, to: input.to, subject: input.subject, html: input.html });
    await logEmail({ toEmail: input.to, subject: input.subject, provider: "smtp", status: "sent" });
    return { sent: true };
  } catch (err) {
    await logEmail({
      toEmail: input.to,
      subject: input.subject,
      provider: "smtp",
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: false };
  }
}

export async function recentEmailLogs(limit = 15) {
  const database = requireDb();
  return database
    .select()
    .from(emailLog)
    .orderBy(desc(emailLog.createdAt))
    .limit(limit);
}

export function maskKeyLike(value: string | null): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  return `${"\u2022".repeat(6)}${tail}`;
}

/** Shared navy/gold branded HTML shell for transactional emails. */
export function brandedEmailHtml(input: {
  label: string;
  heading: string;
  bodyLines: string[];
  ctaUrl?: string;
  ctaLabel?: string;
  footer?: string;
}): string {
  return [
    `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1a2733">`,
    `<div style="background:#081826;padding:18px 24px;border-radius:8px 8px 0 0">`,
    `<strong style="color:#f6cf6e;font-size:15px;letter-spacing:1px">${input.label}</strong>`,
    `</div>`,
    `<div style="border:1px solid #e5e2da;border-top:0;padding:24px;border-radius:0 0 8px 8px">`,
    `<h2 style="margin:0 0 12px;font-size:17px">${input.heading}</h2>`,
    ...input.bodyLines.map((l) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.55">${l}</p>`),
    input.ctaUrl && input.ctaLabel
      ? `<p style="margin:16px 0 0"><a href="${input.ctaUrl}" style="display:inline-block;background:#c98e12;color:#081826;font-weight:bold;font-size:13px;padding:10px 20px;border-radius:999px;text-decoration:none">${input.ctaLabel}</a></p>`
      : "",
    input.footer ? `<p style="margin:18px 0 0;font-size:11px;color:#98a2ad">${input.footer}</p>` : "",
    `</div></div>`,
  ].join("");
}
