import "server-only";
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db, requireDb } from "@/db";
import { settings } from "@/db/schema";

export type PaystackConfig = {
  secretKey: string | null;
  publicKey: string | null;
  enabled: boolean;
};

const KEYS = {
  secretKey: "paystack_secret_key",
  publicKey: "paystack_public_key",
  enabled: "paystack_enabled",
} as const;

function fallback(): PaystackConfig {
  return {
    secretKey: process.env.PAYSTACK_SECRET_KEY || null,
    publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || null,
    enabled: true,
  };
}

export async function getPaystackConfig(): Promise<PaystackConfig> {
  if (!db) return fallback();
  try {
    const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const get = (k: string): string | null => {
      const v = map.get(k);
      return v && v.trim() ? v.trim() : null;
    };
    return {
      secretKey: get(KEYS.secretKey) ?? (process.env.PAYSTACK_SECRET_KEY || null),
      publicKey: get(KEYS.publicKey) ?? (process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || null),
      enabled: !(map.get(KEYS.enabled) === "0"),
    };
  } catch {
    return fallback();
  }
}

export function isPaystackConfigured(c: PaystackConfig): boolean {
  return Boolean(c.secretKey);
}

export async function savePaystackConfig(values: {
  secretKey?: string | null;
  clearSecretKey?: boolean;
  publicKey?: string | null;
  enabled?: boolean;
}): Promise<void> {
  const database = requireDb();
  const upserts: { key: string; value: string }[] = [];
  const push = (key: string, value: string) => upserts.push({ key, value });

  if (values.clearSecretKey) push(KEYS.secretKey, "");
  else if (values.secretKey?.trim()) push(KEYS.secretKey, values.secretKey.trim());
  if (values.publicKey !== undefined) push(KEYS.publicKey, values.publicKey?.trim() ?? "");
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

const API_BASE = "https://api.paystack.co";

export async function initializeTransaction(input: {
  email: string;
  amountCents: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  /** Binds this charge to a Paystack subscription plan (recurring billing) instead of a one-off charge. */
  planCode?: string;
}): Promise<{ ok: true; authorizationUrl: string } | { ok: false; error: string }> {
  const config = await getPaystackConfig();
  if (!config.secretKey) return { ok: false, error: "Online payments aren't configured yet." };

  try {
    const res = await fetch(`${API_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.secretKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountCents,
        currency: input.currency,
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata ?? {},
        ...(input.planCode ? { plan: input.planCode } : {}),
      }),
    });
    const body = (await res.json().catch(() => null)) as
      | { status?: boolean; message?: string; data?: { authorization_url?: string } }
      | null;
    if (!res.ok || !body?.status || !body.data?.authorization_url) {
      return { ok: false, error: body?.message || `Paystack error (${res.status})` };
    }
    return { ok: true, authorizationUrl: body.data.authorization_url };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Paystack." };
  }
}

export type PaystackVerifyResult =
  | {
      ok: true;
      status: "success";
      reference: string;
      amountCents: number;
      currency: string;
      channel: string | null;
      customerCode: string | null;
      planCode: string | null;
    }
  | { ok: true; status: "not_success"; reference: string; rawStatus: string }
  | { ok: false; error: string };

/** Calls Paystack's verify endpoint — the authoritative source for a transaction's real status/amount. */
export async function verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
  const config = await getPaystackConfig();
  if (!config.secretKey) return { ok: false, error: "Online payments aren't configured yet." };

  try {
    const res = await fetch(`${API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { authorization: `Bearer ${config.secretKey}` },
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as
      | {
          status?: boolean;
          message?: string;
          data?: {
            status?: string;
            reference?: string;
            amount?: number;
            currency?: string;
            channel?: string;
            plan?: string | null;
            customer?: { customer_code?: string } | null;
          };
        }
      | null;
    if (!res.ok || !body?.status || !body.data) {
      return { ok: false, error: body?.message || `Paystack error (${res.status})` };
    }
    const data = body.data;
    if (data.status === "success") {
      return {
        ok: true,
        status: "success",
        reference: data.reference || reference,
        amountCents: data.amount ?? 0,
        currency: (data.currency ?? "").toUpperCase(),
        channel: data.channel ?? null,
        customerCode: data.customer?.customer_code ?? null,
        planCode: data.plan ?? null,
      };
    }
    return { ok: true, status: "not_success", reference: data.reference || reference, rawStatus: data.status ?? "unknown" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Paystack." };
  }
}

export async function createPlan(input: {
  name: string;
  amountCents: number;
  currency: string;
  interval: "monthly";
}): Promise<{ ok: true; planCode: string } | { ok: false; error: string }> {
  const config = await getPaystackConfig();
  if (!config.secretKey) return { ok: false, error: "Online payments aren't configured yet." };
  try {
    const res = await fetch(`${API_BASE}/plan`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.secretKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        amount: input.amountCents,
        currency: input.currency,
        interval: input.interval,
      }),
    });
    const body = (await res.json().catch(() => null)) as
      | { status?: boolean; message?: string; data?: { plan_code?: string } }
      | null;
    if (!res.ok || !body?.status || !body.data?.plan_code) {
      return { ok: false, error: body?.message || `Paystack error (${res.status})` };
    }
    return { ok: true, planCode: body.data.plan_code };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Paystack." };
  }
}

/** Emails the subscriber a Paystack-hosted link to update their card or cancel — we don't build our own cancel UI. */
export async function sendSubscriptionManageLink(
  subscriptionCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const config = await getPaystackConfig();
  if (!config.secretKey) return { ok: false, error: "Online payments aren't configured yet." };
  try {
    const res = await fetch(`${API_BASE}/subscription/${encodeURIComponent(subscriptionCode)}/manage/email`, {
      method: "POST",
      headers: { authorization: `Bearer ${config.secretKey}` },
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string } | null;
    if (!res.ok || !body?.status) return { ok: false, error: body?.message || `Paystack error (${res.status})` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Paystack." };
  }
}

/** Verifies the `x-paystack-signature` header using a constant-time comparison. */
export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  const config = await getPaystackConfig();
  if (!config.secretKey) return false;

  const expected = crypto.createHmac("sha512", config.secretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function maskKeyLike(value: string | null): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  return `${"•".repeat(6)}${tail}`;
}
