import "server-only";
import { and, desc, eq, gt, isNotNull, lt, sql } from "drizzle-orm";
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
  /** Kept only for failed sends so the daily retry can re-send it. */
  html?: string | null;
  attempts?: number;
}): Promise<void> {
  const database = requireDb();
  try {
    await database.insert(emailLog).values(row);
  } catch {
    // The html/attempts columns come from migrations/0004_automation_events_email_retry.sql; if that hasn't
    // been applied yet, still record the send the way it always was.
    try {
      await database.insert(emailLog).values({
        toEmail: row.toEmail,
        subject: row.subject,
        provider: row.provider,
        status: row.status,
        error: row.error ?? null,
      });
    } catch {
      /* logging must never break the action */
    }
  }
}

type SendAttempt = { ok: true } | { ok: false; error: string };

async function attemptSend(
  config: EmailConfig,
  input: { to: string; subject: string; html: string },
): Promise<SendAttempt> {
  const from = `${config.fromName} <${config.fromAddress}>`;
  try {
    if (config.resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.resendKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
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
      return { ok: true };
    }
    const transporter = nodemailer.createTransport({
      host: config.smtpHost!,
      port: config.smtpPort ?? 587,
      secure: (config.smtpPort ?? 587) === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass ?? "" } : undefined,
    });
    await transporter.sendMail({ from, to: input.to, subject: input.subject, html: input.html });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** A 4xx from Resend (other than 429) means the message itself is bad, so retrying can't help. */
function isRetryable(error: string): boolean {
  const match = error.match(/^Resend (\d{3})/);
  if (!match) return true; // network / SMTP errors are usually transient
  const status = Number(match[1]);
  return status >= 500 || status === 429;
}

/**
 * Sends an email via the configured provider. Never throws; the result is logged to email_log.
 * A transient provider failure is retried once straight away; anything still failing keeps its
 * body in the log so the daily cron (retryFailedEmails) can try again.
 */
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

  const provider = config.resendKey ? "resend" : "smtp";
  let attempts = 1;
  let outcome = await attemptSend(config, input);
  if (!outcome.ok && isRetryable(outcome.error)) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    attempts = 2;
    outcome = await attemptSend(config, input);
  }

  if (outcome.ok) {
    await logEmail({ toEmail: input.to, subject: input.subject, provider, status: "sent", attempts });
    return { sent: true };
  }
  await logEmail({
    toEmail: input.to,
    subject: input.subject,
    provider,
    status: "failed",
    error: outcome.error,
    html: isRetryable(outcome.error) ? input.html : null,
    attempts,
  });
  return { sent: false };
}

const MAX_EMAIL_ATTEMPTS = 5;
const RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Daily retry of emails that failed for a transient reason. Re-sends the stored body and
 * flips the same log row to "sent" on success, so the admin email log stays truthful.
 */
export async function retryFailedEmails(limit = 40): Promise<{ tried: number; sent: number }> {
  const database = requireDb();
  const config = await getEmailConfig();
  if (!config.enabled || !isEmailConfigured(config)) return { tried: 0, sent: 0 };

  const rows = await database
    .select({
      id: emailLog.id,
      toEmail: emailLog.toEmail,
      subject: emailLog.subject,
      html: emailLog.html,
      attempts: emailLog.attempts,
    })
    .from(emailLog)
    .where(
      and(
        eq(emailLog.status, "failed"),
        isNotNull(emailLog.html),
        lt(emailLog.attempts, MAX_EMAIL_ATTEMPTS),
        gt(emailLog.createdAt, new Date(Date.now() - RETRY_WINDOW_MS)),
      ),
    )
    .orderBy(emailLog.createdAt)
    .limit(limit);

  let sent = 0;
  for (const row of rows) {
    const outcome = await attemptSend(config, { to: row.toEmail, subject: row.subject, html: row.html! });
    if (outcome.ok) {
      sent += 1;
      await database
        .update(emailLog)
        .set({ status: "sent", error: null, html: null, attempts: row.attempts + 1 })
        .where(eq(emailLog.id, row.id));
    } else {
      await database
        .update(emailLog)
        .set({
          error: outcome.error,
          attempts: row.attempts + 1,
          // Stop keeping the body once it can never be retried again.
          html: isRetryable(outcome.error) && row.attempts + 1 < MAX_EMAIL_ATTEMPTS ? row.html : null,
        })
        .where(eq(emailLog.id, row.id));
    }
  }
  return { tried: rows.length, sent };
}

export async function recentEmailLogs(limit = 15) {
  const database = requireDb();
  // Explicit columns: never drags the (large) stored html body into the admin page.
  return database
    .select({
      id: emailLog.id,
      toEmail: emailLog.toEmail,
      subject: emailLog.subject,
      provider: emailLog.provider,
      status: emailLog.status,
      error: emailLog.error,
      createdAt: emailLog.createdAt,
    })
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
