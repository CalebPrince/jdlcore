import "server-only";
import { sql } from "drizzle-orm";
import { db, requireDb } from "@/db";
import { settings } from "@/db/schema";

/**
 * Analytics pricing tiers — admin-editable (Site Settings, administrator/superadmin),
 * backing both the public pricing page (src/app/analytics/page.tsx#pricing) and
 * self-serve checkout. Depot and Trader are billed through Paystack; Enterprise is
 * always "Talk to Us" (priceCents === null marks a tier as not self-serve billable).
 */
export type AnalyticsPlanId = "depot" | "trader" | "enterprise";
export type SelfServePlanId = "depot" | "trader";

export type AnalyticsPlanContent = {
  id: AnalyticsPlanId;
  label: string;
  tagline: string;
  priceCents: number | null; // null = "Custom" / not self-serve billable
  currency: "GHS";
  interval: "monthly";
  monthlyQuestionLimit: number | null; // null = unlimited
  seatLimit: number | null; // null = unlimited
  features: string[];
  ctaLabel: string;
  highlight: boolean; // "Most Popular" badge
};

export const DEFAULT_ANALYTICS_PLANS: Record<AnalyticsPlanId, AnalyticsPlanContent> = {
  depot: {
    id: "depot",
    label: "Depot",
    tagline: "For single-site operators who want answers on tap.",
    priceCents: 120_000,
    currency: "GHS",
    interval: "monthly",
    monthlyQuestionLimit: 150,
    seatLimit: 3,
    features: ["150 questions per month", "Up to 3 seats", "Industry & market assistant", "Email support"],
    ctaLabel: "Request Depot Access",
    highlight: false,
  },
  trader: {
    id: "trader",
    label: "Trader",
    tagline: "For trading teams that live on volumes and variances.",
    priceCents: 280_000,
    currency: "GHS",
    interval: "monthly",
    monthlyQuestionLimit: 600,
    seatLimit: 10,
    features: [
      "600 questions per month",
      "Up to 10 seats",
      "Your inspection history, searchable",
      "Variance & trend briefings",
      "Priority support",
    ],
    ctaLabel: "Request Trader Access",
    highlight: true,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    tagline: "For OMCs, lenders and depots with their own data.",
    priceCents: null,
    currency: "GHS",
    interval: "monthly",
    monthlyQuestionLimit: null,
    seatLimit: null,
    features: [
      "Unlimited questions",
      "Unlimited seats",
      "Your documents connected to the assistant",
      "Dedicated onboarding & SLA",
    ],
    ctaLabel: "Talk to Us",
    highlight: false,
  },
};

const PLAN_IDS: AnalyticsPlanId[] = ["depot", "trader", "enterprise"];

function contentKey(id: AnalyticsPlanId): string {
  return `analytics_plan_content_${id}`;
}

export function isAnalyticsPlanId(value: string | null | undefined): value is AnalyticsPlanId {
  return value === "depot" || value === "trader" || value === "enterprise";
}

/** Depot/Trader only — the tiers billed through Paystack self-serve checkout. */
export function isSelfServePlanId(value: string | null | undefined): value is "depot" | "trader" {
  return value === "depot" || value === "trader";
}

export async function getAnalyticsPlans(): Promise<Record<AnalyticsPlanId, AnalyticsPlanContent>> {
  if (!db) return DEFAULT_ANALYTICS_PLANS;
  try {
    const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const out = { ...DEFAULT_ANALYTICS_PLANS };
    for (const id of PLAN_IDS) {
      const raw = map.get(contentKey(id));
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as Partial<AnalyticsPlanContent>;
        out[id] = { ...DEFAULT_ANALYTICS_PLANS[id], ...parsed, id };
      } catch {
        /* corrupt content — keep default for this tier */
      }
    }
    return out;
  } catch {
    return DEFAULT_ANALYTICS_PLANS;
  }
}

export async function getAnalyticsPlan(id: AnalyticsPlanId): Promise<AnalyticsPlanContent> {
  const all = await getAnalyticsPlans();
  return all[id];
}

/**
 * Saves a tier's content. Callers that change `priceCents` on a Paystack-billed tier
 * are responsible for clearing that tier's cached plan_code (see analytics-billing.ts)
 * so the next checkout creates a fresh Paystack plan at the new price — existing
 * subscribers keep their original (grandfathered) rate.
 */
export async function saveAnalyticsPlan(id: AnalyticsPlanId, content: Omit<AnalyticsPlanContent, "id">): Promise<void> {
  const database = requireDb();
  await database
    .insert(settings)
    .values({ key: contentKey(id), value: JSON.stringify({ ...content, id }) })
    .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
}
