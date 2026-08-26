import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requireDb } from "@/db";
import { clients, jobCompletionData, jobUpdates, jobs, tanks } from "@/db/schema";
import { getInspector } from "@/lib/inspector-auth";
import { JOB_STATUS_META, SERVICE_TYPE_LABEL, type JobStatus, type ServiceType } from "@/lib/jobs";
import {
  AcceptDeclineForms,
  AmendResubmitForm,
  CompletionDataForm,
  ProgressUpdateForm,
  StockReadingForm,
  SubmitForApprovalForm,
} from "@/components/inspector/inspector-job-forms";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function InspectorJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();

  const inspector = await getInspector();
  if (!inspector) return null;

  const database = requireDb();
  const rows = await database
    .select({ job: jobs, client: clients })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!rows[0] || rows[0].job.assignedInspectorId !== inspector.id) notFound();
  const job = rows[0].job;
  const client = rows[0].client;

  const [timeline, completion, tankList] = await Promise.all([
    database.select().from(jobUpdates).where(eq(jobUpdates.jobId, jobId)).orderBy(asc(jobUpdates.createdAt)),
    database.select().from(jobCompletionData).where(eq(jobCompletionData.jobId, jobId)).limit(1),
    job.serviceType === "stock_monitoring"
      ? database.select().from(tanks).where(eq(tanks.clientId, job.clientId))
      : Promise.resolve([]),
  ]);

  const meta = JOB_STATUS_META[job.status as JobStatus] ?? JOB_STATUS_META.assigned;
  const cd = completion[0];
  const lastRejection = [...timeline].reverse().find((u) => u.status === "rejected_amendment");

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/inspector"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold-600"
      >
        <ArrowLeft className="h-4 w-4" /> My Jobs
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-display text-sm font-bold tracking-wide text-gold-700">{job.ref}</span>
          <Badge variant="secondary" className={meta.badgeClass}>
            {meta.label}
          </Badge>
          {job.serviceType && (
            <Badge variant="outline">{SERVICE_TYPE_LABEL[job.serviceType as ServiceType] ?? job.serviceType}</Badge>
          )}
        </div>
        <h1 className="mb-1 mt-2 font-display text-xl font-bold text-navy-950">
          {job.service}
          {job.location ? ` — ${job.location}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {client.name}
          {client.company ? ` · ${client.company}` : ""} · Opened {dateFmt.format(new Date(job.createdAt))}
        </p>
      </div>

      {job.status === "rejected_amendment" && lastRejection?.note && (
        <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="m-0 font-semibold">Operations returned this job for amendment:</p>
          <p className="m-0 mt-1">{lastRejection.note}</p>
        </div>
      )}

      {job.status === "assigned" && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Accept This Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <AcceptDeclineForms jobId={job.id} />
          </CardContent>
        </Card>
      )}

      {(job.status === "inspector_accepted" || job.status === "in_progress") && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Progress Updates</CardTitle>
          </CardHeader>
          <CardContent>
            <ProgressUpdateForm jobId={job.id} />
          </CardContent>
        </Card>
      )}

      {["inspector_accepted", "in_progress", "rejected_amendment"].includes(job.status) && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Completion Data</CardTitle>
          </CardHeader>
          <CardContent>
            <CompletionDataForm
              jobId={job.id}
              defaultValues={
                cd
                  ? {
                      dateTimeStarted: cd.dateTimeStarted
                        ? new Date(cd.dateTimeStarted).toISOString().slice(0, 16)
                        : null,
                      dateTimeCompleted: cd.dateTimeCompleted
                        ? new Date(cd.dateTimeCompleted).toISOString().slice(0, 16)
                        : null,
                      service: cd.service,
                      gov: cd.gov,
                      gsv: cd.gsv,
                      metricTonnesAir: cd.metricTonnesAir,
                      metricTonnesVacuum: cd.metricTonnesVacuum,
                      inspectorComments: cd.inspectorComments,
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {job.serviceType === "stock_monitoring" &&
        ["inspector_accepted", "in_progress", "rejected_amendment"].includes(job.status) && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Log Stock Reading</CardTitle>
            </CardHeader>
            <CardContent>
              <StockReadingForm jobId={job.id} tanks={tankList} />
            </CardContent>
          </Card>
        )}

      {(job.status === "inspector_accepted" || job.status === "in_progress") && (
        <Card>
          <CardContent className="pt-6">
            <SubmitForApprovalForm jobId={job.id} />
          </CardContent>
        </Card>
      )}

      {job.status === "rejected_amendment" && (
        <Card>
          <CardContent className="pt-6">
            <AmendResubmitForm jobId={job.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Job History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol
            className="relative m-0 list-none border-l-2 pl-6"
            style={{ borderColor: "rgba(201,142,18,0.35)" }}
          >
            {[...timeline].reverse().map((u, i) => {
              const um = JOB_STATUS_META[u.status as JobStatus] ?? JOB_STATUS_META.assigned;
              return (
                <li key={u.id} className="relative pb-6 last:pb-0">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                      i === 0 ? "bg-gold-600" : "bg-navy-300"
                    }`}
                    style={{ boxShadow: "0 0 0 1px rgba(201,142,18,0.35)" }}
                  />
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-sm font-bold text-navy-950">{um.label}</span>
                    <span className="text-xs text-ink-faint">{dateTimeFmt.format(new Date(u.createdAt))}</span>
                  </div>
                  {u.note && <p className="mb-0 mt-1 text-sm text-ink-soft">{u.note}</p>}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
