"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffRole } from "@/lib/staff-auth";
import { getPaystackConfig, isPaystackConfigured, savePaystackConfig } from "@/lib/paystack";
import { getPlanCode } from "@/lib/analytics-billing";
import { logAudit } from "@/lib/audit";
import type { FormState } from "./submissions";

const schema = z.object({
  enabled: z.string().optional(),
  secretKey: z.string().max(400).optional(),
  clearSecretKey: z.string().optional(),
  publicKey: z.string().max(400).optional(),
});

export async function savePaystackSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const current = await requireStaffRole(["superadmin"]);
  if (!current) return { ok: false, message: "Unauthorized" };
  const f = schema.safeParse(Object.fromEntries(formData));
  if (!f.success) return { ok: false, message: "Invalid values." };
  const v = f.data;

  // Same defensive check as the Resend key field — catches a browser/password
  // manager autofilling the wrong value into a masked secret field.
  if (v.secretKey?.trim() && !/^sk_(test|live)_/.test(v.secretKey.trim())) {
    return {
      ok: false,
      message:
        'That doesn\'t look like a Paystack secret key (should start with "sk_test_" or "sk_live_") — nothing was saved.',
    };
  }
  if (v.publicKey?.trim() && !/^pk_(test|live)_/.test(v.publicKey.trim())) {
    return {
      ok: false,
      message:
        'That doesn\'t look like a Paystack public key (should start with "pk_test_" or "pk_live_") — nothing was saved.',
    };
  }

  try {
    await savePaystackConfig({
      enabled: v.enabled === "on",
      secretKey: v.secretKey,
      clearSecretKey: v.clearSecretKey === "on",
      publicKey: v.publicKey,
    });
  } catch (err) {
    console.error("savePaystackSettings:", err);
    return { ok: false, message: "Could not save Paystack settings." };
  }

  revalidatePath("/admin/payments");
  const touched = [
    v.secretKey || v.clearSecretKey === "on" ? "Secret key" : null,
    v.publicKey ? "Public key" : null,
  ].filter(Boolean);
  await logAudit({
    actor: current,
    action: "settings.paystack_updated",
    targetType: "settings",
    summary:
      touched.length > 0
        ? `Updated Paystack settings — changed: ${touched.join(", ")}.`
        : "Updated Paystack settings (no credentials changed).",
  });
  return { ok: true, message: "Paystack settings saved." };
}

export async function syncAnalyticsPlanCodes(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  if (!(await requireStaffRole(["superadmin"]))) return { ok: false, message: "Unauthorized" };

  const [depot, trader] = await Promise.all([getPlanCode("depot"), getPlanCode("trader")]);
  if (!depot.ok || !trader.ok) {
    const failed = [!depot.ok ? `Depot: ${depot.error}` : null, !trader.ok ? `Trader: ${trader.error}` : null].filter(
      Boolean,
    );
    return { ok: false, message: failed.join(" · ") };
  }
  return { ok: true, message: `Synced — Depot: ${depot.planCode}, Trader: ${trader.planCode}.` };
}

export async function testPaystackConnection(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  if (!(await requireStaffRole(["superadmin"]))) return { ok: false, message: "Unauthorized" };

  const config = await getPaystackConfig();
  if (!isPaystackConfigured(config)) return { ok: false, message: "No secret key configured yet." };

  try {
    const res = await fetch("https://api.paystack.co/bank?currency=GHS", {
      headers: { authorization: `Bearer ${config.secretKey}` },
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { status?: boolean; message?: string } | null;
    if (!res.ok || !body?.status) {
      return { ok: false, message: body?.message || `Paystack rejected the key (${res.status}).` };
    }
    return { ok: true, message: "Connected — the secret key is valid." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Could not reach Paystack." };
  }
}
