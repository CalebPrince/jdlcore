import Link from "next/link";
import { desc, eq, and, ne, sql } from "drizzle-orm";
import {
  FileText,
  FolderKanban,
  ReceiptText,
  Activity,
} from "lucide-react";
import { requireDb } from "@/db";
import { jobs, invoices } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { JOB_STATUS_META, type JobStatus } from "@/lib/jobs";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const timeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function PortalDashboardPage() {
  const client = await getPortalClient();
  if (!client) return null;

  let jobList: Awaited<ReturnType<typeof loadJobs>> = [];
  let unpaidCount = 0;
  try {
    jobList = await loadJobs(client.id);
    const database = requireDb();
    const rows = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .innerJoin(jobs, eq(invoices.jobId, jobs.id))
      .where(and(eq(jobs.clientId, client.id), ne(invoices.status, "paid")));
    unpaidCount = rows[0]?.count ?? 0;
  } catch {
    /* render empty state */
  }

  const active = jobList.filter((j) => j.status !== "closed").length;
  const readyDocs = jobList.filter(
    (j) => j.status === "report_issued" || j.status === "invoice_issued" || j.status === "paid",
  ).length;

  return (
    <div className="flex flex-col gap-7">
      <div>
        <h1 className="font-display text-[1.6rem] font-bold text-navy-950">
          Welcome back, {client.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track every inspection job, download reports and Certificates of
          Quantity, and keep an eye on invoices.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={FolderKanban} label="Total jobs" value={jobList.length} />
        <StatCard icon={Activity} label="Active jobs" value={active} />
        <StatCard
          icon={ReceiptText}
          label={unpaidCount === 1 ? "Unpaid invoice" : "Unpaid invoices"}
          value={unpaidCount}
          highlight={unpaidCount > 0}
        />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="m-0 font-display text-lg font-bold text-navy-950">
            Your Inspections
          </h2>
          {readyDocs > 0 && (
            <span className="text-xs font-semibold text-[#1f7a4d]">
              {readyDocs} job{readyDocs === 1 ? "" : "s"} with documents ready
            </span>
          )}
        </div>

        {jobList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <FileText className="h-8 w-8 text-ink-faint" />
              <p className="m-0 text-sm text-muted-foreground">
                No inspection jobs yet. Once a request is confirmed by the JDL
                Core team it will appear here with live status updates.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {jobList.map((job) => {
              const meta = JOB_STATUS_META[job.status as JobStatus] ??
                JOB_STATUS_META.awaiting_assignment;
              return (
                <li key={job.id}>
                  <Link
                    href={`/portal/jobs/${job.id}`}
                    className="block rounded-[var(--radius)] border bg-white p-5 shadow-[var(--shadow-sm-soft)] transition-shadow hover:shadow-[var(--shadow-md-soft)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="font-display text-sm font-bold tracking-wide text-gold-700">
                        {job.ref}
                      </span>
                      <span
                        className={`rounded-full px-3 py-0.5 text-xs font-bold ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                      <span className="ml-auto text-xs text-ink-faint">
                        Updated {timeFmt.format(new Date(job.updatedAt))}
                      </span>
                    </div>
                    <p className="mb-0 mt-2 text-[1.02rem] font-semibold text-navy-950">
                      {job.service}
                      {job.location ? ` — ${job.location}` : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

async function loadJobs(clientId: number) {
  const database = requireDb();
  return database
    .select()
    .from(jobs)
    .where(eq(jobs.clientId, clientId))
    .orderBy(desc(jobs.updatedAt));
}

function StatCard({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-gold-500/60" : undefined}>
      <CardContent className="flex items-center gap-4">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            highlight ? "bg-gold-500/15 text-gold-600" : "bg-navy-100 text-navy-800"
          }`}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="font-display text-[1.75rem] font-bold leading-none tabular-nums text-navy-950">
            {value}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
