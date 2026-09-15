"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { academyLearners } from "@/db/schema";
import { requireAcademyLearnerAction } from "@/app/actions/academy";
import { getAcademyPlans, isAcademyPlanId } from "@/lib/academy-plans";
import { getAcademyPlanCode } from "@/lib/academy-billing";
import { initializeTransaction } from "@/lib/paystack";

export async function startAcademySubscription(formData: FormData) {
  const learner = await requireAcademyLearnerAction();
  const planId = formData.get("plan");
  if (!isAcademyPlanId(planId)) throw new Error("Choose a valid subscription plan.");
  const planCode = await getAcademyPlanCode(planId);
  if (!planCode.ok) throw new Error(planCode.error);
  const database = requireDb();
  await database.update(academyLearners).set({ subscriptionPlan: planId, subscriptionStatus: "none" }).where(eq(academyLearners.id, learner.id));
  const values = await headers();
  const host = values.get("x-forwarded-host") ?? values.get("host") ?? "localhost:3000";
  const protocol = values.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const reference = `jdl-academy-sub-${learner.id}-${Date.now()}`;
  const plan = (await getAcademyPlans())[planId];
  const result = await initializeTransaction({ email: learner.email, amountCents: plan.priceCents, currency: plan.currency, reference, callbackUrl: `${protocol}://${host}/academy/subscribe/callback`, planCode: planCode.planCode, metadata: { learnerId: learner.id, plan: planId } });
  if (!result.ok) throw new Error(result.error);
  redirect(result.authorizationUrl);
}
