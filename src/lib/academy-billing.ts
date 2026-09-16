import "server-only";
import { eq, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { academyLearners, settings } from "@/db/schema";
import { getAcademyPlans, type AcademyPlanId } from "@/lib/academy-plans";
import { createPlan, verifyTransaction } from "@/lib/paystack";
import { sendNotification, brandedEmailHtml } from "@/lib/email";
import { notifyStaffBoth } from "@/lib/notifications";
import { logPaymentTransaction } from "@/lib/payment-transactions";

const OPS_ROLES = ["operations", "administrator", "superadmin"] as const;

function learnerEmail(heading: string, bodyLines: string[]): string {
  return brandedEmailHtml({
    label: "JDL CORE ACADEMY",
    heading,
    bodyLines,
    ctaUrl: "https://academy.jdlcore.com",
    ctaLabel: "Open Academy",
  });
}

function adminEmail(heading: string, bodyLines: string[]): string {
  return brandedEmailHtml({
    label: "JDL CORE ADMIN",
    heading,
    bodyLines,
    ctaUrl: "https://jdlcore.com/admin/academy",
    ctaLabel: "Open Academy Admin",
  });
}

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
    await notifyStaffBoth({
      roles: [...OPS_ROLES],
      type: "payment_amount_mismatch",
      title: `Academy subscription amount mismatch — ${learner.email}`,
      body: `A Paystack charge for ${learner.name}'s ${plan.label} Academy plan doesn't match the expected amount. Access was not activated — needs manual review.`,
      link: "/admin/academy",
      emailSubject: "Academy subscription amount mismatch",
      emailHtml: adminEmail("Academy subscription amount mismatch", [
        `A Paystack charge for ${learner.name}'s ${plan.label} Academy plan doesn't match the expected amount. Access was not activated — needs manual review.`,
      ]),
    });
    return false;
  }
  const end = new Date();
  end.setMonth(end.getMonth() + plan.periodMonths);
  await database.update(academyLearners).set({ subscriptionStatus: "active", currentPeriodEnd: end, paystackCustomerCode: verified.customerCode, paystackPlanCode: verified.planCode }).where(eq(academyLearners.id, learner.id));
  await logPaymentTransaction({ kind: "academy_subscription", status: "success", reference, amountCents: verified.amountCents, currency: verified.currency, description: `${plan.label} Academy subscription — ${learner.name}`, payerEmail: learner.email });

  await sendNotification({
    to: learner.email,
    subject: "Welcome to JDL Core Academy",
    html: learnerEmail(`Welcome, ${learner.name}`, [
      `Your ${plan.label} Academy membership is active — full access to courses, assessments, and certificates.`,
      "Pick up where you left off, or start a new course.",
    ]),
  });
  await notifyStaffBoth({
    roles: [...OPS_ROLES],
    type: "academy_subscription_started",
    title: `New Academy subscriber — ${learner.name}`,
    body: `${learner.name} (${learner.email}) subscribed to the ${plan.label} plan.`,
    link: "/admin/academy",
    emailSubject: `New Academy subscriber: ${learner.name}`,
    emailHtml: adminEmail(`New Academy subscriber — ${learner.name}`, [
      `${learner.name} (${learner.email}) subscribed to the ${plan.label} plan.`,
    ]),
  });

  return true;
}

export async function activateAcademyRenewal(customerCode: string | undefined) {
  if (!customerCode) return;
  const database = requireDb();
  const learner = (await database.select().from(academyLearners).where(eq(academyLearners.paystackCustomerCode, customerCode)).limit(1))[0];
  if (!learner || (learner.subscriptionPlan !== "monthly" && learner.subscriptionPlan !== "yearly")) return;
  const plan = (await getAcademyPlans())[learner.subscriptionPlan];
  const end = new Date();
  end.setMonth(end.getMonth() + plan.periodMonths);
  await database.update(academyLearners).set({ subscriptionStatus: "active", currentPeriodEnd: end }).where(eq(academyLearners.id, learner.id));

  await sendNotification({
    to: learner.email,
    subject: "Your JDL Core Academy membership renewed",
    html: learnerEmail("Your membership renewed", [
      `Your ${plan.label} Academy membership has renewed — next renewal ${end.toDateString()}.`,
      "No action needed. Keep learning.",
    ]),
  });
}

/** invoice.payment_failed webhook — Academy side. Mirrors the Analytics handler in analytics-billing.ts. */
export async function handleAcademyInvoicePaymentFailed(data: {
  customer?: { customer_code?: string } | null;
  amount?: number;
  currency?: string;
  id?: number | string;
}): Promise<void> {
  const customerCode = data.customer?.customer_code;
  if (!customerCode) return;

  const database = requireDb();
  const learner = (await database.select().from(academyLearners).where(eq(academyLearners.paystackCustomerCode, customerCode)).limit(1))[0];
  if (!learner) return;

  await logPaymentTransaction({
    kind: "academy_subscription",
    status: "failed",
    reference: data.id ? `invoice-${data.id}` : `invoice-failed-${Date.now()}`,
    amountCents: data.amount ?? 0,
    currency: (data.currency ?? "GHS").toUpperCase(),
    description: `${learner.subscriptionPlan ?? "Subscription"} renewal — ${learner.name} (payment failed)`,
    payerEmail: learner.email,
  });

  if (learner.subscriptionStatus !== "active") return;

  await database.update(academyLearners).set({ subscriptionStatus: "past_due" }).where(eq(academyLearners.id, learner.id));

  await sendNotification({
    to: learner.email,
    subject: "Action needed: your JDL Core Academy payment failed",
    html: learnerEmail("We couldn't process your renewal", [
      "Your last renewal payment failed. Please update your card to avoid losing access.",
      "We'll retry automatically, but updating your card now is the fastest fix.",
    ]),
  });
}
