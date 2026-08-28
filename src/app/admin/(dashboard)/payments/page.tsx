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
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getStaff } from "@/lib/staff-auth";
import { getPaystackConfig, isPaystackConfigured, maskKeyLike } from "@/lib/paystack";
import { paymentTransactionTotals, recentPaymentTransactions } from "@/lib/payment-transactions";
import { formatMoney } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payments | JDL Core Admin" };

const STATUS_BADGE: Record<string, string> = {
  success: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  failed: "bg-red-500/10 text-red-700",
  mismatch: "bg-[rgba(201,142,18,0.14)] text-gold-700",
};

const KIND_LABEL: Record<string, string> = {
  invoice: "Invoice",
  analytics_subscription: "Analytics",
};

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

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

  const [transactions, totals] = await Promise.all([
    recentPaymentTransactions(50),
    paymentTransactionTotals(),
  ]);

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
          <CardTitle>Recent Payments</CardTitle>
          <CardDescription>
            {totals.successCount === 0
              ? "No successful payments recorded yet."
              : `${totals.successCount} successful ${totals.successCount === 1 ? "payment" : "payments"} recorded — ${formatMoney(totals.successCents, "GHS")} total, across invoices and Analytics subscriptions.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Payments will show up here as soon as the first one comes through.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {dateTimeFmt.format(new Date(tx.createdAt))}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{KIND_LABEL[tx.kind] ?? tx.kind}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm">
                        {tx.description}
                        {tx.payerEmail && (
                          <span className="block text-xs text-muted-foreground">{tx.payerEmail}</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatMoney(tx.amountCents, tx.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={STATUS_BADGE[tx.status] ?? ""}>
                          {tx.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate font-mono text-xs text-muted-foreground">
                        {tx.reference}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
