"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { analyticsUsers } from "@/db/schema";
import { hashPassword } from "@/lib/portal-auth";
import { getAnalyticsPlan, isSelfServePlanId } from "@/lib/analytics-plans";
import { getPlanCode } from "@/lib/analytics-billing";
import { initializeTransaction } from "@/lib/paystack";
import type { FormState } from "./submissions";

async function siteOrigin(): Promise<string> {
  const values = await headers();
  const host = values.get("x-forwarded-host") ?? values.get("host") ?? "localhost:3000";
  const protocol = values.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

const schema = z.object({
  plan: z.string(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  password: z.string().min(8).max(200),
});

export async function startAnalyticsSubscription(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Enter valid details and a password of at least 8 characters." };
  const f = parsed.data;
  if (!isSelfServePlanId(f.plan)) return { ok: false, message: "Choose Depot or Trader to subscribe online." };

  const def = await getAnalyticsPlan(f.plan);
  if (def.priceCents === null) {
    return { ok: false, message: `${def.label} doesn't have online checkout enabled yet — please contact us.` };
  }

  const database = requireDb();
  const email = f.email.toLowerCase();
  const existing = await database.select().from(analyticsUsers).where(eq(analyticsUsers.email, email)).limit(1);
  if (existing[0] && existing[0].subscriptionStatus === "active") {
    return { ok: false, message: "This email already has an active Analytics subscription — sign in instead." };
  }

  let userId: number;
  if (existing[0]) {
    userId = existing[0].id;
    await database
      .update(analyticsUsers)
      .set({
        name: f.name,
        company: f.company || null,
        phone: f.phone || null,
        passwordHash: hashPassword(f.password),
        plan: f.plan,
        monthlyQuestionLimit: def.monthlyQuestionLimit,
        seatLimit: def.seatLimit,
        subscriptionStatus: "none",
      })
      .where(eq(analyticsUsers.id, userId));
  } else {
    const inserted = await database
      .insert(analyticsUsers)
      .values({
        name: f.name,
        email,
        company: f.company || null,
        phone: f.phone || null,
        passwordHash: hashPassword(f.password),
        status: "invited", // flips to "active" once payment is confirmed
        plan: f.plan,
        monthlyQuestionLimit: def.monthlyQuestionLimit,
        seatLimit: def.seatLimit,
      })
      .returning({ id: analyticsUsers.id });
    userId = inserted[0].id;
  }

  const planCode = await getPlanCode(f.plan);
  if (!planCode.ok) return { ok: false, message: `Could not start checkout: ${planCode.error}` };

  const reference = `jdl-sub-${userId}-${Date.now()}`;
  const site = await siteOrigin();
  const result = await initializeTransaction({
    email,
    amountCents: def.priceCents,
    currency: def.currency,
    reference,
    callbackUrl: `${site}/analytics/subscribe/callback`,
    planCode: planCode.planCode,
    metadata: { userId, plan: f.plan },
  });
  if (!result.ok) return { ok: false, message: result.error };

  redirect(result.authorizationUrl);
}
