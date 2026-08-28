import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  PaystackSettingsForm,
  SyncAnalyticsPlansForm,
  TestPaystackConnectionForm,
  type PaystackSettingsView,
} from "@/components/admin/paystack-settings-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getStaff } from "@/lib/staff-auth";
import { getPaystackConfig, isPaystackConfigured, maskKeyLike } from "@/lib/paystack";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payments | JDL Core Admin" };

export default async function AdminPaymentsPage() {
  const current = await getStaff();
  if (!current || current.role !== "superadmin") notFound();

  const config = await getPaystackConfig();
  const mode: PaystackSettingsView["mode"] = config.secretKey?.startsWith("sk_live_")
    ? "live"
    : config.secretKey?.startsWith("sk_test_")
      ? "test"
      : null;
  const view: PaystackSettingsView = {
    enabled: config.enabled,
    configured: isPaystackConfigured(config),
    secretKeyMasked: maskKeyLike(config.secretKey),
    publicKey: config.publicKey ?? "",
    mode,
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Command Center</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect Paystack so clients can pay an invoice online — verified automatically, no manual
          receipt review needed. Bank transfer with a manual receipt stays available as a fallback.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Paystack</CardTitle>
          <CardDescription>
            From your Paystack dashboard → Settings → API Keys &amp; Webhooks. Also add a webhook there
            pointing to <code>/api/webhooks/paystack</code> on this site — that&apos;s what confirms a
            payment even if the client closes their browser before returning.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <PaystackSettingsForm view={view} />
          {view.configured && (
            <div className="flex flex-col gap-4 border-t pt-4" style={{ borderColor: "var(--border)" }}>
              <TestPaystackConnectionForm />
            </div>
          )}
        </CardContent>
      </Card>

      {view.configured && (
        <Card>
          <CardHeader>
            <CardTitle>Analytics Subscription Plans</CardTitle>
            <CardDescription>
              Depot and Trader each need a matching Paystack plan to bill through. One is created
              automatically the first time someone subscribes — use this if you&apos;ve just changed a
              price in Site Settings and want the new plan ready ahead of time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SyncAnalyticsPlansForm />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
