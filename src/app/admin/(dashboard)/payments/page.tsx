import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, Ban, CheckCircle2, ReceiptText } from "lucide-react";
import { PaystackSettingsForm, SyncAnalyticsPlansForm, TestPaystackConnectionForm, type PaystackSettingsView } from "@/components/admin/paystack-settings-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getStaff } from "@/lib/staff-auth";
import { getPaystackConfig, isPaystackConfigured, maskKeyLike } from "@/lib/paystack";
import { paymentTransactionTotals, recentPaymentTransactions } from "@/lib/payment-transactions";
import { formatMoney } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payments | JDL Core Admin" };

const STATUS_BADGE: Record<string, string> = {
  success: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]", failed: "bg-red-500/10 text-red-700",
  canceled: "bg-slate-500/10 text-slate-700", cancelled: "bg-slate-500/10 text-slate-700",
  mismatch: "bg-[rgba(201,142,18,0.14)] text-gold-700",
};
const STATUS_LABEL: Record<string, string> = { success: "Paid", failed: "Declined", canceled: "Canceled", cancelled: "Canceled", mismatch: "Needs review" };
const KIND_LABEL: Record<string, string> = { invoice: "Invoice", analytics_subscription: "Analytics", academy_subscription: "Academy" };
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function AdminPaymentsPage() {
  const current = await getStaff();
  if (!current || !["administrator", "superadmin"].includes(current.role)) notFound();

  const [config, transactions, totals] = await Promise.all([getPaystackConfig(), recentPaymentTransactions(50), paymentTransactionTotals()]);
  const mode: PaystackSettingsView["mode"] = config.secretKey?.startsWith("sk_live_") ? "live" : config.secretKey?.startsWith("sk_test_") ? "test" : null;
  const view: PaystackSettingsView = { enabled: config.enabled, configured: isPaystackConfigured(config), secretKeyMasked: maskKeyLike(config.secretKey), publicKey: config.publicKey ?? "", mode };
  const unsuccessful = transactions.filter((tx) => ["failed", "canceled", "cancelled"].includes(tx.status));
  const needsReview = transactions.filter((tx) => tx.status === "mismatch");
  const unsuccessfulCount = totals.failedCount + totals.canceledCount;
  const unsuccessfulCents = totals.failedCents + totals.canceledCents;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="eyebrow">Revenue desk</p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">Track every Paystack outcome, spot payments that need attention, and manage the live connection.</p>
      </header>

      <section aria-label="Payment summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <PaymentMetric icon={CheckCircle2} label="Collected" amount={totals.successCents} count={totals.successCount} tone="success" />
        <PaymentMetric icon={Ban} label="Declined or canceled" amount={unsuccessfulCents} count={unsuccessfulCount} tone="danger" />
        <PaymentMetric icon={AlertTriangle} label="Needs review" amount={totals.mismatchCents} count={totals.mismatchCount} tone="warning" />
        <PaymentMetric icon={ReceiptText} label="All attempts" amount={totals.successCents + unsuccessfulCents + totals.mismatchCents} count={totals.totalCount} tone="neutral" />
      </section>

      <Card>
        <CardHeader><CardTitle>Declined and canceled</CardTitle><CardDescription>Recent attempts where no payment was completed. Clients can safely try again.</CardDescription></CardHeader>
        <CardContent>{unsuccessful.length === 0 ? <EmptyState>No declined or canceled payments in the latest activity.</EmptyState> : <PaymentTable transactions={unsuccessful} />}</CardContent>
      </Card>

      {needsReview.length > 0 ? (
        <Card className="border-gold-500/40">
          <CardHeader><CardTitle>Needs review</CardTitle><CardDescription>Paystack received these payments, but the amount did not match the expected charge.</CardDescription></CardHeader>
          <CardContent><PaymentTable transactions={needsReview} /></CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>All payment activity</CardTitle><CardDescription>The 50 most recent invoice, Analytics, and Academy payment outcomes.</CardDescription></CardHeader>
        <CardContent>{transactions.length === 0 ? <EmptyState>Payments will appear here as soon as the first attempt comes through.</EmptyState> : <PaymentTable transactions={transactions} />}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Paystack connection</CardTitle><CardDescription>Use the API keys from Paystack Settings. Keep the webhook pointed to <code>/api/webhooks/paystack</code> so payments are confirmed even when a client closes their browser.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-5">
          <PaystackSettingsForm view={view} />
          {view.configured ? <div className="flex flex-col gap-4 border-t pt-4" style={{ borderColor: "var(--border)" }}><TestPaystackConnectionForm /></div> : null}
        </CardContent>
      </Card>

      {view.configured ? <Card><CardHeader><CardTitle>Analytics subscription plans</CardTitle><CardDescription>Sync Depot and Trader plans after changing subscription prices.</CardDescription></CardHeader><CardContent><SyncAnalyticsPlansForm /></CardContent></Card> : null}
    </div>
  );
}

type PaymentRow = Awaited<ReturnType<typeof recentPaymentTransactions>>[number];

function PaymentTable({ transactions }: { transactions: PaymentRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow><TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>Payment</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Reference</TableHead></TableRow></TableHeader>
        <TableBody>{transactions.map((tx) => <TableRow key={tx.id}>
          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{dateTimeFmt.format(new Date(tx.createdAt))}</TableCell>
          <TableCell className="whitespace-nowrap text-xs">{KIND_LABEL[tx.kind] ?? tx.kind}</TableCell>
          <TableCell className="max-w-xs text-sm"><span className="block truncate">{tx.description}</span>{tx.payerEmail ? <span className="block truncate text-xs text-muted-foreground">{tx.payerEmail}</span> : null}</TableCell>
          <TableCell className="whitespace-nowrap font-semibold tabular-nums">{formatMoney(tx.amountCents, tx.currency)}</TableCell>
          <TableCell><Badge variant="secondary" className={STATUS_BADGE[tx.status] ?? ""}>{STATUS_LABEL[tx.status] ?? tx.status}</Badge></TableCell>
          <TableCell className="max-w-[160px] truncate font-mono text-xs text-muted-foreground" title={tx.reference}>{tx.reference}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function PaymentMetric({ icon: Icon, label, amount, count, tone }: { icon: React.ElementType; label: string; amount: number; count: number; tone: "success" | "danger" | "warning" | "neutral" }) {
  const tones = { success: "bg-emerald-50 text-emerald-700", danger: "bg-red-50 text-red-700", warning: "bg-amber-50 text-amber-700", neutral: "bg-navy-100 text-navy-800" };
  return <Card className="overflow-hidden"><CardContent className="flex items-start justify-between gap-3 p-5">
    <div><p className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-bold tabular-nums text-navy-950">{formatMoney(amount, "GHS")}</p><p className="mt-1 text-xs text-muted-foreground">{count} {count === 1 ? "transaction" : "transactions"}</p></div>
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
  </CardContent></Card>;
}
