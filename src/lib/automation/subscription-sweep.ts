import "server-only";
import { and, eq, inArray, isNotNull, lt, or, isNull } from "drizzle-orm";
import { requireDb } from "@/db";
import { academyLearners, analyticsUsers } from "@/db/schema";
import { fetchSubscription } from "@/lib/paystack";
import { brandedEmailHtml } from "@/lib/email";
import { notifyStaffBoth } from "@/lib/notifications";
import { claimEvent } from "./events";

const MAX_LOOKUPS = 15;
/** Paystack charges on the renewal day itself, so give a just-expired period a couple of days before looking. */
const GRACE_MS = 2 * 24 * 60 * 60 * 1000;

function monthBefore(d: Date): Date {
  const start = new Date(d);
  start.setMonth(start.getMonth() - 1);
  return start;
}

/**
 * Subscription state changes only ever arrive by webhook, so a missed event leaves stale data
 * behind. This checks paying Analytics and Academy subscribers whose recorded period has run out
 * against Paystack itself:
 *  - Paystack says it's still active with a future payment date: the stored period is refreshed
 *    from that date (this also repairs Analytics accounts whose window was frozen by the old
 *    renewal handler, which fixes their monthly-quota window).
 *  - Paystack says it has ended or needs attention: staff are told once. Nothing is suspended or
 *    changed automatically, since that call affects a paying customer's access.
 */
export async function runSubscriptionSweep() {
  const database = requireDb();
  const now = new Date();
  const lapsedBefore = new Date(now.getTime() - GRACE_MS);
  let lookups = 0;
  let refreshed = 0;
  const flagged: string[] = [];

  const analytics = await database
    .select({
      id: analyticsUsers.id,
      email: analyticsUsers.email,
      subscriptionCode: analyticsUsers.paystackSubscriptionCode,
    })
    .from(analyticsUsers)
    .where(
      and(
        inArray(analyticsUsers.subscriptionStatus, ["active", "past_due"]),
        isNotNull(analyticsUsers.paystackSubscriptionCode),
        or(isNull(analyticsUsers.currentPeriodEnd), lt(analyticsUsers.currentPeriodEnd, lapsedBefore)),
      ),
    );

  for (const user of analytics) {
    if (lookups >= MAX_LOOKUPS) break;
    lookups += 1;
    const result = await fetchSubscription(user.subscriptionCode!);
    if (!result.ok) continue;
    const { status, nextPaymentDate } = result.subscription;
    if (status === "active" && nextPaymentDate && nextPaymentDate > now) {
      await database
        .update(analyticsUsers)
        .set({ currentPeriodStart: monthBefore(nextPaymentDate), currentPeriodEnd: nextPaymentDate })
        .where(eq(analyticsUsers.id, user.id));
      refreshed += 1;
    } else if (status !== "active" && (await claimEvent("subscription_lapsed", `analytics:${user.id}:${status}`))) {
      flagged.push(`Analytics: ${user.email} (Paystack status "${status}")`);
    }
  }

  const learners = await database
    .select({
      id: academyLearners.id,
      email: academyLearners.email,
      subscriptionCode: academyLearners.paystackSubscriptionCode,
    })
    .from(academyLearners)
    .where(
      and(
        inArray(academyLearners.subscriptionStatus, ["active", "past_due"]),
        isNotNull(academyLearners.paystackSubscriptionCode),
        lt(academyLearners.currentPeriodEnd, lapsedBefore),
      ),
    );

  for (const learner of learners) {
    if (lookups >= MAX_LOOKUPS) break;
    lookups += 1;
    const result = await fetchSubscription(learner.subscriptionCode!);
    if (!result.ok) continue;
    const { status, nextPaymentDate } = result.subscription;
    if (status === "active" && nextPaymentDate && nextPaymentDate > now) {
      await database
        .update(academyLearners)
        .set({ currentPeriodEnd: nextPaymentDate })
        .where(eq(academyLearners.id, learner.id));
      refreshed += 1;
    } else if (status !== "active" && (await claimEvent("subscription_lapsed", `academy:${learner.id}:${status}`))) {
      flagged.push(`Academy: ${learner.email} (Paystack status "${status}")`);
    }
  }

  if (flagged.length > 0) {
    const title = `${flagged.length} subscription${flagged.length === 1 ? "" : "s"} need a look`;
    await notifyStaffBoth({
      roles: ["operations", "administrator", "superadmin"],
      type: "subscription_lapsed",
      title,
      body: flagged.slice(0, 3).join("; "),
      link: "/admin/analytics",
      emailSubject: title,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE ADMIN",
        heading: title,
        bodyLines: [
          "These subscribers' billing period has passed and Paystack no longer shows an upcoming payment. Their access was not changed.",
          ...flagged.slice(0, 20),
        ],
        ctaUrl: "https://jdlcore.com/admin/analytics",
        ctaLabel: "Open Analytics admin",
      }),
    });
  }

  return { lookups, refreshed, flagged: flagged.length };
}
