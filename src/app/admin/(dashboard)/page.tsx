import Link from "next/link";
import { sql, desc } from "drizzle-orm";
import {
  FileText,
  MessageSquare,
  MessagesSquare,
  BellRing,
  GraduationCap,
  Smartphone,
  LayoutList,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  CircleX,
  ScanSearch,
} from "lucide-react";
import { requireDb } from "@/db";
import { submissions } from "@/db/schema";
import { getContactSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { loadGaugeBoard } from "@/lib/reports";
import { GaugeBoard } from "@/components/reports/gauge-board";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { paymentTransactionTotals } from "@/lib/payment-transactions";
import { formatMoney } from "@/lib/jobs";

export const dynamic = "force-dynamic";

const TYPE_META: Record<
  string,
  { label: string; icon: React.ElementType }
> = {
  quote: { label: "Quote requests", icon: FileText },
  contact: { label: "Messages", icon: MessageSquare },
  chat_handoff: { label: "Chat handoffs", icon: MessagesSquare },
  waitlist_analytics: { label: "Analytics waitlist", icon: BellRing },
  waitlist_academy: { label: "Academy waitlist", icon: GraduationCap },
  waitlist_mobile_app: { label: "Mobile app waitlist", icon: Smartphone },
};

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

async function loadStats() {
  const database = requireDb();
  const counts = await database
    .select({
      type: submissions.type,
      count: sql<number>`count(*)::int`,
    })
    .from(submissions)
    .groupBy(submissions.type);
  const recent = await database
    .select()
    .from(submissions)
    .orderBy(desc(submissions.createdAt))
    .limit(6);
  return { counts, recent };
}

export default async function AdminDashboardPage() {
  const settings = await getContactSettings();

  const placeholders = (Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[])
    .filter((k) => k !== "whatsappMessage" && settings[k] === DEFAULT_SETTINGS[k]);

  let stats: Awaited<ReturnType<typeof loadStats>> | null = null;
  let dbError = false;
  try {
    stats = await loadStats();
  } catch {
    dbError = true;
  }

  let board: Awaited<ReturnType<typeof loadGaugeBoard>> = [];
  try {
    board = await loadGaugeBoard({});
  } catch {
    /* section is hidden below when empty */
  }

  const byType = new Map(stats?.counts.map((c) => [c.type, c.count]) ?? []);
  const total = stats?.counts.reduce((sum, c) => sum + c.count, 0) ?? 0;
  const paymentTotals = await paymentTransactionTotals();
  const unsuccessfulCount = paymentTotals.failedCount + paymentTotals.canceledCount;
  const unsuccessfulCents = paymentTotals.failedCents + paymentTotals.canceledCents;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          Everything happening across jdlcore.com at a glance.
        </p>
      </div>

      <section className="rounded-2xl border border-navy-950/10 bg-navy-950 p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-gold-400">Live payments</p>
            <h2 className="mt-1 font-display text-xl font-bold">Paystack pulse</h2>
          </div>
          <Link href="/admin/payments" className="text-sm font-semibold text-gold-400 hover:text-gold-300">Open payments →</Link>
        </div>
        <div className="mt-5 grid gap-px overflow-hidden rounded-xl bg-white/10 sm:grid-cols-3">
          <DashboardPaymentMetric icon={CreditCard} label="Collected" amount={paymentTotals.successCents} count={paymentTotals.successCount} />
          <DashboardPaymentMetric icon={CircleX} label="Declined or canceled" amount={unsuccessfulCents} count={unsuccessfulCount} />
          <DashboardPaymentMetric icon={ScanSearch} label="Needs review" amount={paymentTotals.mismatchCents} count={paymentTotals.mismatchCount} />
        </div>
      </section>

      {board.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="m-0 font-display text-lg font-bold text-navy-950">Inventory Monitoring</h2>
              <p className="m-0 text-sm text-muted-foreground">
                Latest depot gauge readings from Stock Monitoring jobs
              </p>
            </div>
            <Link href="/admin/reports" className="link-arrow shrink-0 text-sm whitespace-nowrap">
              View all →
            </Link>
          </div>
          <GaugeBoard depots={board} compact limit={2} />
        </section>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={LayoutList}
          label="Total submissions"
          value={total}
          hint="All forms across the site"
          highlight
        />
        {[...Object.entries(TYPE_META).map(([type, meta]) => ({
          type,
          ...meta,
        }))].map(({ type, label, icon: Icon }) => (
          <StatCard
            key={type}
            icon={Icon}
            label={label}
            value={byType.get(type) ?? 0}
          />
        ))}
      </div>

      {dbError && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Database not reachable — check your Supabase connection in{" "}
            <code>.env</code>.
          </CardContent>
        </Card>
      )}

      {/* Recent activity */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="font-display">Recent Activity</CardTitle>
            <CardDescription>Latest submissions from the site</CardDescription>
          </div>
          <Link
            href="/admin/inbox"
            className="link-arrow shrink-0 text-sm whitespace-nowrap"
          >
            View all →
          </Link>
        </CardHeader>
        <CardContent>
          {!stats || stats.recent.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No submissions yet. They&apos;ll appear here the moment someone
              fills a form.
            </p>
          ) : (
            <ul className="divide-y">
              {stats.recent.map((r) => {
                const meta = TYPE_META[r.type];
                const Icon = meta?.icon ?? LayoutList;
                return (
                  <li key={r.id} className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-100 text-navy-800">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-navy-950">
                        {r.name}
                        <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                          {meta?.label ?? r.type}
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.service ?? r.email ?? "—"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {timeFmt.format(new Date(r.createdAt))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Status strip */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#1f7a4d]" />
          Forms live
        </Badge>
        <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#1f7a4d]" />
          Supabase connected
        </Badge>
        <Badge variant="secondary" className="gap-1.5 px-3 py-1.5">
          {placeholders.length === 0 ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-[#1f7a4d]" />
              Contact details set
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-gold-600" />
              Contact details incomplete
            </>
          )}
        </Badge>
      </div>
    </div>
  );
}

function DashboardPaymentMetric({ icon: Icon, label, amount, count }: { icon: React.ElementType; label: string; amount: number; count: number }) {
  return (
    <div className="flex items-start justify-between gap-3 bg-navy-950 p-4 sm:p-5">
      <div><p className="text-xs font-semibold text-white/60">{label}</p><p className="mt-1 font-display text-xl font-bold tabular-nums text-white">{formatMoney(amount, "GHS")}</p><p className="mt-1 text-xs text-white/45">{count} {count === 1 ? "transaction" : "transactions"}</p></div>
      <Icon className="h-5 w-5 text-gold-400" />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={highlight ? "border-gold-500/60 bg-white" : undefined}
      style={{ borderColor: highlight ? undefined : "var(--border)" }}
    >
      <CardContent className="flex items-center gap-4">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            highlight
              ? "bg-gold-500/15 text-gold-600"
              : "bg-navy-100 text-navy-800"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[1.75rem] font-bold leading-none text-navy-950 tabular-nums">
            {value}
          </p>
          <p className="mt-1 truncate text-sm text-ink-soft">{label}</p>
          {hint && (
            <p className="truncate text-xs text-ink-faint">{hint}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
