import "server-only";
import { eq, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { academyLearners, settings } from "@/db/schema";
import { getAcademyPlans, type AcademyPlanId } from "@/lib/academy-plans";
import { createPlan, verifyTransaction } from "@/lib/paystack";
import { logPaymentTransaction } from "@/lib/payment-transactions";

export async function getAcademyPlanCode(plan: AcademyPlanId) {
  const database = requireDb();
  const key = `paystack_academy_plan_${plan}`;
  const found = await database.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  if (found[0]?.value) return { ok: true as const, planCode: found[0].value };
  const def = (await getAcademyPlans())[plan];
  const created = await createPlan({ name: `JDL Core Academy — ${def.label}`, amountCents: def.priceCents, currency: def.currency, interval: def.interval });
  if (!created.ok) return created;
  await database.insert(settings).values({ key, value: created.planCode }).onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
  return created;
}

export async function finalizeAcademyCheckout(reference: string) {
  const match = /^jdl-academy-sub-(\d+)-/.exec(reference);
  if (!match) return false;
  const database = requireDb();
  const learner = (await database.select().from(academyLearners).where(eq(academyLearners.id, Number(match[1]))).limit(1))[0];
  if (!learner || (learner.subscriptionPlan !== "monthly" && learner.subscriptionPlan !== "yearly")) return false;
  const verified = await verifyTransaction(reference);
  if (!verified.ok || verified.status !== "success") return false;
  const plan = (await getAcademyPlans())[learner.subscriptionPlan];
  if (verified.amountCents !== plan.priceCents || verified.currency !== plan.currency) {
    await logPaymentTransaction({ kind: "academy_subscription", status: "mismatch", reference, amountCents: verified.amountCents, currency: verified.currency, description: `${plan.label} Academy subscription — ${learner.name}`, payerEmail: learner.email });
    return false;
  }
  const end = new Date();
  end.setMonth(end.getMonth() + plan.periodMonths);
  await database.update(academyLearners).set({ subscriptionStatus: "active", currentPeriodEnd: end, paystackCustomerCode: verified.customerCode, paystackPlanCode: verified.planCode }).where(eq(academyLearners.id, learner.id));
  await logPaymentTransaction({ kind: "academy_subscription", status: "success", reference, amountCents: verified.amountCents, currency: verified.currency, description: `${plan.label} Academy subscription — ${learner.name}`, payerEmail: learner.email });
  return true;
}

export async function activateAcademyRenewal(customerCode: string | undefined) {
  if (!customerCode) return;
  const database = requireDb();
  const learner = (await database.select().from(academyLearners).where(eq(academyLearners.paystackCustomerCode, customerCode)).limit(1))[0];
  if (!learner || (learner.subscriptionPlan !== "monthly" && learner.subscriptionPlan !== "yearly")) return;
  const end = new Date();
  end.setMonth(end.getMonth() + (await getAcademyPlans())[learner.subscriptionPlan].periodMonths);
  await database.update(academyLearners).set({ subscriptionStatus: "active", currentPeriodEnd: end }).where(eq(academyLearners.id, learner.id));
}
