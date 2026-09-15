export type AcademyPlanId = "monthly" | "yearly";

export const academyPlans = {
  monthly: { id: "monthly", label: "Monthly", priceCents: 15000, currency: "GHS", interval: "monthly" as const, periodMonths: 1 },
  yearly: { id: "yearly", label: "Yearly", priceCents: 150000, currency: "GHS", interval: "annually" as const, periodMonths: 12 },
};

export async function getAcademyPlans() {
  if (!db) return academyPlans;
  try {
    const rows = await db.select({ key: settings.key, value: settings.value }).from(settings)
      .where(inArray(settings.key, ["academy_monthly_price_cents", "academy_yearly_price_cents"]));
    const values = new Map(rows.map((row) => [row.key, Number(row.value)]));
    return {
      monthly: { ...academyPlans.monthly, priceCents: values.get("academy_monthly_price_cents") || academyPlans.monthly.priceCents },
      yearly: { ...academyPlans.yearly, priceCents: values.get("academy_yearly_price_cents") || academyPlans.yearly.priceCents },
    };
  } catch {
    return academyPlans;
  }
}

export function isAcademyPlanId(value: unknown): value is AcademyPlanId {
  return value === "monthly" || value === "yearly";
}
import "server-only";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
