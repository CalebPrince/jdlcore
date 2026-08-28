import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { AnalyticsSubscribeForm } from "@/components/analytics/subscribe-form";
import { getAnalyticsPlan, isSelfServePlanId } from "@/lib/analytics-plans";
import { formatMoney } from "@/lib/jobs";

export const metadata: Metadata = { title: "Subscribe | JDL Core Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsSubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; error?: string }>;
}) {
  const { plan: planParam, error } = await searchParams;
  const plan = isSelfServePlanId(planParam) ? planParam : "depot";
  const def = await getAnalyticsPlan(plan);
  if (def.priceCents === null) notFound();

  return (
    <AuthShell
      brand="JDL Core Analytics"
      title={`Subscribe to ${def.label}.`}
      description={def.tagline}
      backHref="/analytics#pricing"
      backLabel="Back to Pricing"
      logo="/logo-analytics.png"
      eyebrow="Subscriber checkout"
      panelTitle={`${formatMoney(def.priceCents, def.currency)} / month`}
      panelDescription="Billed monthly through Paystack. Manage or cancel any time from your workspace."
      highlights={def.features}
    >
      <div className="auth-form-card">
        {error === "failed" && (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            That payment attempt wasn&apos;t completed. No charge was made — try again below.
          </p>
        )}
        {error === "review" && (
          <p className="mb-4 rounded-lg bg-[rgba(201,142,18,0.1)] p-3 text-sm text-gold-700">
            We received a payment that needs a quick manual check. Our team will follow up by email shortly.
          </p>
        )}
        <AnalyticsSubscribeForm plan={plan} priceLabel={formatMoney(def.priceCents, def.currency)} />
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Already subscribed?{" "}
          <Link href="/analytics/login" className="font-semibold text-gold-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
