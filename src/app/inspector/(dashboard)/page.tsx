import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { FileText } from "lucide-react";
import { requireDb } from "@/db";
import { jobs } from "@/db/schema";
import { getInspector } from "@/lib/inspector-auth";
import { JOB_STATUS_META, type JobStatus } from "@/lib/jobs";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const BUCKETS: { key: string; label: string; statuses: JobStatus[] }[] = [
  { key: "assigned", label: "New Assigned", statuses: ["assigned"] },
  { key: "active", label: "Accepted / In Progress", statuses: ["inspector_accepted", "in_progress"] },
  { key: "awaiting_approval", label: "Awaiting Approval", statuses: ["awaiting_approval"] },
  { key: "returned", label: "Returned for Amendment", statuses: ["rejected_amendment"] },
  {
    key: "history",
    label: "History",
    statuses: ["approved", "report_issued", "invoice_issued", "paid", "closed"],
  },
];

export default async function InspectorDashboardPage() {
  const inspector = await getInspector();
  if (!inspector) return null;

  let jobList: Awaited<ReturnType<typeof loadJobs>> = [];
  try {
    jobList = await loadJobs(inspector.id);
  } catch {
    /* render empty state */
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-[1.6rem] font-bold text-navy-950">
          Welcome back, {inspector.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your assigned inspections, organized by where they stand.
        </p>
      </div>

      {BUCKETS.map((bucket) => {
        const bucketJobs = jobList.filter((j) => bucket.statuses.includes(j.status as JobStatus));
        if (bucketJobs.length === 0 && bucket.key === "history") return null;
        return (
          <section key={bucket.key} className="flex flex-col gap-3">
            <h2 className="m-0 font-display text-lg font-bold text-navy-950">
              {bucket.label} {bucketJobs.length > 0 && `(${bucketJobs.length})`}
            </h2>
            {bucketJobs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                  <FileText className="h-7 w-7 text-ink-faint" />
                  <p className="m-0 text-sm text-muted-foreground">Nothing here right now.</p>
                </CardContent>
              </Card>
            ) : (
              <ul className="flex flex-col gap-3">
                {bucketJobs.map((job) => {
                  const meta = JOB_STATUS_META[job.status as JobStatus] ?? JOB_STATUS_META.assigned;
                  return (
                    <li key={job.id}>
                      <Link
                        href={`/inspector/jobs/${job.id}`}
                        className="block rounded-[var(--radius)] border bg-white p-5 shadow-[var(--shadow-sm-soft)] transition-shadow hover:shadow-[var(--shadow-md-soft)]"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <span className="font-display text-sm font-bold tracking-wide text-gold-700">
                            {job.ref}
                          </span>
                          <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${meta.badgeClass}`}>
                            {meta.label}
                          </span>
                          <span className="ml-auto text-xs text-ink-faint">
                            Updated {dateFmt.format(new Date(job.updatedAt))}
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
        );
      })}
    </div>
  );
}

async function loadJobs(inspectorId: number) {
  const database = requireDb();
  return database
    .select()
    .from(jobs)
    .where(eq(jobs.assignedInspectorId, inspectorId))
    .orderBy(desc(jobs.updatedAt));
}
