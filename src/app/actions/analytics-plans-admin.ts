"use server";

import { revalidatePath } from "next/cache";
import { requireStaffRole } from "@/lib/staff-auth";
import { getAnalyticsPlan, saveAnalyticsPlan, type AnalyticsPlanId } from "@/lib/analytics-plans";
import { invalidatePlanCode } from "@/lib/analytics-billing";
import { logAudit } from "@/lib/audit";
import type { FormState } from "./submissions";

const ADMIN_ROLES = ["administrator", "superadmin"] as const;
const PLAN_IDS: AnalyticsPlanId[] = ["depot", "trader", "enterprise"];

function field(raw: Record<string, FormDataEntryValue>, key: string): string {
  const v = raw[key];
  return typeof v === "string" ? v.trim() : "";
}

function parseOptionalInt(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function parseOptionalPriceCents(v: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export async function saveAnalyticsPricing(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };

  const raw = Object.fromEntries(formData);
  const changedPrices: string[] = [];

  try {
    for (const id of PLAN_IDS) {
      const label = field(raw, `${id}_label`);
      if (!label) return { ok: false, message: `${id} needs a name.` };

      const tagline = field(raw, `${id}_tagline`);
      const priceCents = parseOptionalPriceCents(field(raw, `${id}_price`));
      const monthlyQuestionLimit = parseOptionalInt(field(raw, `${id}_monthlyLimit`));
      const seatLimit = parseOptionalInt(field(raw, `${id}_seatLimit`));
      const features = field(raw, `${id}_features`)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const ctaLabel = field(raw, `${id}_ctaLabel`) || (priceCents === null ? "Talk to Us" : `Request ${label} Access`);
      const highlight = raw[`${id}_highlight`] === "on";

      const previous = await getAnalyticsPlan(id);
      await saveAnalyticsPlan(id, {
        label,
        tagline,
        priceCents,
        currency: "GHS",
        interval: "monthly",
        monthlyQuestionLimit,
        seatLimit,
        features,
        ctaLabel,
        highlight,
      });

      if (id !== "enterprise" && previous.priceCents !== priceCents) {
        await invalidatePlanCode(id as "depot" | "trader");
        changedPrices.push(label);
      }
    }
  } catch (err) {
    console.error("saveAnalyticsPricing:", err);
    return { ok: false, message: "Could not save pricing." };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/analytics");
  await logAudit({
    actor: current,
    action: "settings.analytics_pricing_updated",
    targetType: "settings",
    summary:
      changedPrices.length > 0
        ? `Updated Analytics pricing tiers — price changed on: ${changedPrices.join(", ")} (existing subscribers keep their old rate).`
        : "Updated Analytics pricing tiers.",
  });
  return { ok: true, message: "Pricing saved." };
}
