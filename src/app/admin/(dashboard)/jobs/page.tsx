import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, inspectors, jobs } from "@/db/schema";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateJobForm } from "@/components/admin/create-job-form";
import { JOB_STATUS_META, type JobStatus } from "@/lib/jobs";
import { getStaff } from "@/lib/staff-auth";
import { flagOverdueInvoices } from "@/lib/overdue-invoices";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const BUCKETS: { key: string; label: string; statuses: JobStatus[] }[] = [
  { key: "all", label: "All", statuses: [] },
  { key: "unassigned", label: "New / Unassigned", statuses: ["awaiting_assignment"] },
  { key: "assigned", label: "Assigned", statuses: ["assigned"] },
  { key: "in_progress", label: "In Progress", statuses: ["inspector_accepted", "in_progress"] },
  { key: "awaiting_approval", label: "Awaiting Approval", statuses: ["awaiting_approval"] },
  { key: "rejected", label: "Rejected", statuses: ["rejected_amendment"] },
  {
    key: "approved",
    label: "Approved / Billed",
    statuses: ["approved", "report_issued", "invoice_issued", "paid"],
  },
  { key: "closed", label: "Closed", statuses: ["closed"] },
];

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string }>;
}) {
  const { bucket = "all" } = await searchParams;
  const staff = await getStaff();
  void flagOverdueInvoices();

  let jobRows: Awaited<ReturnType<typeof loadJobs>> = [];
  let clientList: Awaited<ReturnType<typeof loadClients>> = [];
  let dbError = false;
  try {
    [jobRows, clientList] = await Promise.all([loadJobs(), loadClients()]);
  } catch {
    dbError = true;
  }

  const active = BUCKETS.find((b) => b.key === bucket) ?? BUCKETS[0];
  const filtered =
    active.statuses.length === 0
      ? jobRows
      : jobRows.filter((j) => active.statuses.includes(j.status as JobStatus));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Inspection Jobs</h1>
        <p className="text-sm text-muted-foreground">
          Tracked jobs with live status updates in the client portal.
        </p>
      </div>

      {staff?.role !== "operations" && (
        <CreateJobForm clients={clientList.map((c) => ({ id: c.id, name: c.name, company: c.company }))} />
      )}

      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <Link
            key={b.key}
            href={b.key === "all" ? "/admin/jobs" : `/admin/jobs?bucket=${b.key}`}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              b.key === active.key
                ? "bg-navy-950 text-paper"
                : "border text-ink-soft hover:bg-paper-deep"
            }`}
            style={b.key === active.key ? undefined : { borderColor: "var(--border)" }}
          >
            {b.label}
          </Link>
        ))}
      </div>

      {dbError ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Database not reachable.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">{active.label} ({filtered.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {filtered.length === 0 && (
              <p className="m-0 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground" style={{ borderColor: "var(--border)" }}>
                No jobs in this bucket.
              </p>
            )}
            {filtered.map((j) => {
              const meta = JOB_STATUS_META[j.status as JobStatus] ?? JOB_STATUS_META.awaiting_assignment;
              return (
                <Link
                  key={j.id}
                  href={`/admin/jobs/${j.id}`}
                  className="block rounded-xl border p-4 transition-colors hover:bg-paper-deep"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="font-display text-sm font-bold tracking-wide text-gold-700">{j.ref}</span>
                    <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${meta.badgeClass}`}>
                      {meta.label}
                    </span>
                    {j.inspectorName && (
                      <span className="text-xs text-ink-faint">Inspector: {j.inspectorName}</span>
                    )}
                    <span className="ml-auto text-xs text-ink-faint">
                      Updated {dateFmt.format(new Date(j.updatedAt))}
                    </span>
                  </div>
                  <p className="mb-0 mt-1.5 text-sm text-navy-950">
                    {j.service}
                    {j.location ? ` — ${j.location}` : ""}
                    <span className="ml-2 text-muted-foreground">
                      · {j.clientName}{j.clientCompany ? ` (${j.clientCompany})` : ""}
                    </span>
                  </p>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function loadJobs() {
  return requireDb()
    .select({
      id: jobs.id,
      ref: jobs.ref,
      service: jobs.service,
      location: jobs.location,
      status: jobs.status,
      updatedAt: jobs.updatedAt,
      clientName: clients.name,
      clientCompany: clients.company,
      inspectorName: inspectors.name,
    })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .leftJoin(inspectors, eq(jobs.assignedInspectorId, inspectors.id))
    .orderBy(desc(jobs.updatedAt));
}

async function loadClients() {
  return requireDb().select().from(clients).orderBy(desc(clients.createdAt));
}
