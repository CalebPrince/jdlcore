import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, requireDb } from "@/db";
import { analyticsUsers, settings } from "@/db/schema";
import { getAnalyticsPlan, isSelfServePlanId, type AnalyticsPlanId } from "@/lib/analytics-plans";
import { createPlan, verifyTransaction } from "@/lib/paystack";
import { createAnalyticsSession } from "@/lib/analytics-auth";
import { sendNotification, brandedEmailHtml } from "@/lib/email";
import { notifyStaffBoth } from "@/lib/notifications";
import { logPaymentTransaction } from "@/lib/payment-transactions";

const OPS_ROLES = ["operations", "administrator", "superadmin"] as const;

function planCodeKey(planId: AnalyticsPlanId): string {
  return `paystack_plan_code_${planId}`;
}

function adminEmail(heading: string, bodyLines: string[]): string {
  return brandedEmailHtml({
    label: "JDL CORE ADMIN",
    heading,
    bodyLines,
    ctaUrl: "https://jdlcore.com/admin/analytics",
    ctaLabel: "Open Analytics Admin",
  });
}

/** Returns the Paystack plan_code for a tier, creating it on Paystack (and caching it) the first time it's needed. */
export async function getPlanCode(planId: "depot" | "trader"): Promise<{ ok: true; planCode: string } | { ok: false; error: string }> {
  const key = planCodeKey(planId);
  if (db) {
    try {
      const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
      const existing = rows[0]?.value?.trim();
      if (existing) return { ok: true, planCode: existing };
    } catch {
      /* fall through and try to create one */
    }
  }

  const def = await getAnalyticsPlan(planId);
  if (def.priceCents === null) return { ok: false, error: `${def.label} has no price set — add one in Site Settings first.` };
  const created = await createPlan({
    name: `JDL Core Analytics — ${def.label}`,
    amountCents: def.priceCents,
    currency: def.currency,
    interval: def.interval,
  });
  if (!created.ok) return created;

  const database = requireDb();
  await database
    .insert(settings)
    .values({ key, value: created.planCode })
    .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
  return { ok: true, planCode: created.planCode };
}

export async function getAllPlanCodes(): Promise<Record<"depot" | "trader", string | null>> {
  if (!db) return { depot: null, trader: null };
  try {
    const rows = await db.select({ key: settings.key, value: settings.value }).from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      depot: map.get(planCodeKey("depot"))?.trim() || null,
      trader: map.get(planCodeKey("trader"))?.trim() || null,
    };
  } catch {
    return { depot: null, trader: null };
  }
}

/** Clears a tier's cached Paystack plan_code — call this after a price change so the next checkout creates a fresh plan at the new price. Existing subscribers keep their original (grandfathered) plan/rate. */
export async function invalidatePlanCode(planId: "depot" | "trader"): Promise<void> {
  const database = requireDb();
  await database
    .insert(settings)
    .values({ key: planCodeKey(planId), value: "" })
    .onConflictDoUpdate({ target: settings.key, set: { value: sql`excluded.value`, updatedAt: new Date() } });
}

function parseUserIdFromReference(reference: string): number | null {
  const match = /^jdl-sub-(\d+)-/.exec(reference);
  return match ? Number(match[1]) : null;
}

export type CheckoutResult =
  | { outcome: "activated"; userId: number }
  | { outcome: "already_active"; userId: number }
  | { outcome: "mismatch"; userId: number }
  | { outcome: "not_success"; reason: string }
  | { outcome: "not_found" }
  | { outcome: "error"; reason: string };

/**
 * Verifies the initial subscription charge against Paystack and, if it's genuinely
 * successful, activates the account immediately (instant login) using an estimated
 * one-month period. The subscription.create webhook reconciles this shortly after
 * with the authoritative subscription_code and real next_payment_date. Idempotent —
 * safe to call from both the browser callback and the webhook for the same reference.
 */
export async function finalizeAnalyticsCheckout(reference: string): Promise<CheckoutResult> {
  const verified = await verifyTransaction(reference);
  if (!verified.ok) return { outcome: "error", reason: verified.error };
  if (verified.status !== "success") return { outcome: "not_success", reason: verified.rawStatus };

  const userId = parseUserIdFromReference(reference);
  if (!userId) return { outcome: "not_found" };

  const database = requireDb();
  const rows = await database.select().from(analyticsUsers).where(eq(analyticsUsers.id, userId)).limit(1);
  const user = rows[0];
  if (!user || !isSelfServePlanId(user.plan)) return { outcome: "not_found" };
  if (user.subscriptionStatus === "active") return { outcome: "already_active", userId: user.id };

  const def = await getAnalyticsPlan(user.plan);
  if (def.priceCents === null || verified.amountCents !== def.priceCents || verified.currency !== def.currency) {
    await notifyStaffBoth({
      roles: [...OPS_ROLES],
      type: "payment_amount_mismatch",
      title: `Analytics subscription amount mismatch — ${user.email}`,
      body: `A Paystack charge for ${user.email}'s ${def.label} plan doesn't match the expected amount. Access was not activated — needs manual review.`,
      link: "/admin/analytics",
      emailSubject: "Analytics subscription amount mismatch",
      emailHtml: adminEmail("Analytics subscription amount mismatch", [
        `A Paystack charge for ${user.email}'s ${def.label} plan doesn't match the expected amount. Access was not activated — needs manual review.`,
      ]),
    });
    await logPaymentTransaction({
      kind: "analytics_subscription",
      status: "mismatch",
      reference,
      amountCents: verified.amountCents,
      currency: verified.currency,
      description: `${def.label} subscription — ${user.name} (amount mismatch)`,
      payerEmail: user.email,
      analyticsUserId: user.id,
    });
    return { outcome: "mismatch", userId: user.id };
  }

  const now = new Date();
  const estimatedPeriodEnd = new Date(now);
  estimatedPeriodEnd.setMonth(estimatedPeriodEnd.getMonth() + 1);

  await database
    .update(analyticsUsers)
    .set({
      status: "active",
      subscriptionStatus: "active",
      paystackCustomerCode: verified.customerCode,
      currentPeriodStart: now,
      currentPeriodEnd: estimatedPeriodEnd,
      lastLoginAt: now,
    })
    .where(eq(analyticsUsers.id, user.id));

  await createAnalyticsSession(user.id);

  await sendNotification({
    to: user.email,
    subject: "Welcome to JDL Core Analytics",
    html: brandedEmailHtml({
      label: "JDL CORE ANALYTICS",
      heading: `Welcome, ${user.name}`,
      bodyLines: [
        `Your ${def.label} subscription is active — ${def.monthlyQuestionLimit ?? "unlimited"} questions a month, up to ${def.seatLimit ?? "unlimited"} seats.`,
        "Jump into your workspace and start asking questions.",
      ],
      ctaUrl: "https://analytics.jdlcore.com/analytics/app",
      ctaLabel: "Open Analytics",
    }),
  });
  await notifyStaffBoth({
    roles: [...OPS_ROLES],
    type: "analytics_subscription_started",
    title: `New Analytics subscriber — ${user.name}`,
    body: `${user.name} (${user.email}) subscribed to the ${def.label} plan.`,
    link: "/admin/analytics",
    emailSubject: `New Analytics subscriber: ${user.name}`,
    emailHtml: adminEmail(`New Analytics subscriber — ${user.name}`, [
      `${user.name} (${user.email}) subscribed to the ${def.label} plan.`,
    ]),
  });
  await logPaymentTransaction({
    kind: "analytics_subscription",
    status: "success",
    reference,
    amountCents: verified.amountCents,
    currency: verified.currency,
    description: `${def.label} subscription — ${user.name}`,
    payerEmail: user.email,
    analyticsUserId: user.id,
  });

  return { outcome: "activated", userId: user.id };
}

type PaystackCustomerRef = { customer_code?: string } | null | undefined;

/** subscription.create webhook — links the subscription_code and the real renewal date to the account. */
export async function handleSubscriptionCreate(data: {
  subscription_code?: string;
  customer?: PaystackCustomerRef;
  plan?: { plan_code?: string } | null;
  next_payment_date?: string;
}): Promise<void> {
  const customerCode = data.customer?.customer_code;
  if (!customerCode || !data.subscription_code) return;

  const database = requireDb();
  const rows = await database.select().from(analyticsUsers).where(eq(analyticsUsers.paystackCustomerCode, customerCode)).limit(1);
  const user = rows[0];
  if (!user) return; // not one of ours, or the checkout callback hasn't linked the customer code yet

  await database
    .update(analyticsUsers)
    .set({
      paystackSubscriptionCode: data.subscription_code,
      paystackPlanCode: data.plan?.plan_code ?? user.paystackPlanCode,
      currentPeriodStart: new Date(),
      currentPeriodEnd: data.next_payment_date ? new Date(data.next_payment_date) : user.currentPeriodEnd,
      subscriptionStatus: "active",
      status: "active",
    })
    .where(eq(analyticsUsers.id, user.id));
}

/** subscription.disable webhook — Paystack gave up on retries or the subscriber canceled. Auto-suspends access. */
export async function handleSubscriptionDisable(data: {
  subscription_code?: string;
  customer?: PaystackCustomerRef;
}): Promise<void> {
  const database = requireDb();
  let user: typeof analyticsUsers.$inferSelect | undefined;

  if (data.subscription_code) {
    const rows = await database
      .select()
      .from(analyticsUsers)
      .where(eq(analyticsUsers.paystackSubscriptionCode, data.subscription_code))
      .limit(1);
    user = rows[0];
  }
  if (!user && data.customer?.customer_code) {
    const rows = await database
      .select()
      .from(analyticsUsers)
      .where(eq(analyticsUsers.paystackCustomerCode, data.customer.customer_code))
      .limit(1);
    user = rows[0];
  }
  if (!user || user.subscriptionStatus === "canceled") return;

  await database
    .update(analyticsUsers)
    .set({ subscriptionStatus: "canceled", status: "disabled" })
    .where(eq(analyticsUsers.id, user.id));

  await sendNotification({
    to: user.email,
    subject: "Your JDL Core Analytics subscription has ended",
    html: brandedEmailHtml({
      label: "JDL CORE ANALYTICS",
      heading: "Your subscription has ended",
      bodyLines: [
        "Your Analytics subscription is no longer active, so access has been paused.",
        "You can resubscribe any time from the pricing page.",
      ],
      ctaUrl: "https://jdlcore.com/analytics#pricing",
      ctaLabel: "View Plans",
    }),
  });
  await notifyStaffBoth({
    roles: [...OPS_ROLES],
    type: "analytics_subscription_ended",
    title: `Analytics subscription ended — ${user.name}`,
    body: `${user.name} (${user.email})'s subscription ended and access was automatically paused.`,
    link: "/admin/analytics",
    emailSubject: `Analytics subscription ended: ${user.name}`,
    emailHtml: adminEmail(`Analytics subscription ended — ${user.name}`, [
      `${user.name} (${user.email})'s subscription ended and access was automatically paused.`,
    ]),
  });
}

/** invoice.payment_failed webhook — a renewal charge failed. Grace period: flag past_due, don't suspend yet (Paystack's own retries end in subscription.disable). */
export async function handleInvoicePaymentFailed(data: {
  customer?: PaystackCustomerRef;
  amount?: number;
  currency?: string;
  id?: number | string;
}): Promise<void> {
  const customerCode = data.customer?.customer_code;
  if (!customerCode) return;

  const database = requireDb();
  const rows = await database.select().from(analyticsUsers).where(eq(analyticsUsers.paystackCustomerCode, customerCode)).limit(1);
  const user = rows[0];
  if (!user) return;

  await logPaymentTransaction({
    kind: "analytics_subscription",
    status: "failed",
    reference: data.id ? `invoice-${data.id}` : `invoice-failed-${Date.now()}`,
    amountCents: data.amount ?? 0,
    currency: (data.currency ?? "GHS").toUpperCase(),
    description: `${user.plan ?? "Subscription"} renewal — ${user.name} (payment failed)`,
    payerEmail: user.email,
    analyticsUserId: user.id,
  });

  if (user.subscriptionStatus !== "active") return;

  await database.update(analyticsUsers).set({ subscriptionStatus: "past_due" }).where(eq(analyticsUsers.id, user.id));

  await sendNotification({
    to: user.email,
    subject: "Action needed: your JDL Core Analytics payment failed",
    html: brandedEmailHtml({
      label: "JDL CORE ANALYTICS",
      heading: "We couldn't process your renewal",
      bodyLines: [
        "Your last renewal payment failed. Please update your card to avoid losing access.",
        "We'll retry automatically, but updating your card now is the fastest fix.",
      ],
      ctaUrl: "https://analytics.jdlcore.com/analytics/app",
      ctaLabel: "Open Analytics",
    }),
  });
}

/** charge.success webhook for a recurring renewal (Paystack-generated reference, not ours). Always logged; also recovers a past_due account. */
export async function handleChargeSuccessRenewal(data: {
  customer?: PaystackCustomerRef;
  amount?: number;
  currency?: string;
  reference?: string;
}): Promise<void> {
  const customerCode = data.customer?.customer_code;
  if (!customerCode) return;

  const database = requireDb();
  const rows = await database.select().from(analyticsUsers).where(eq(analyticsUsers.paystackCustomerCode, customerCode)).limit(1);
  const user = rows[0];
  if (!user) return;

  await logPaymentTransaction({
    kind: "analytics_subscription",
    status: "success",
    reference: data.reference ?? `renewal-${customerCode}-${Date.now()}`,
    amountCents: data.amount ?? 0,
    currency: (data.currency ?? "GHS").toUpperCase(),
    description: `${user.plan ?? "Subscription"} renewal — ${user.name}`,
    payerEmail: user.email,
    analyticsUserId: user.id,
  });

  if (user.subscriptionStatus === "active") return;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await database
    .update(analyticsUsers)
    .set({ subscriptionStatus: "active", status: "active", currentPeriodStart: now, currentPeriodEnd: periodEnd })
    .where(eq(analyticsUsers.id, user.id));
}
