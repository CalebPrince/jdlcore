import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, FileUp } from "lucide-react";
import { requireDb } from "@/db";
import {
  certificates,
  clients,
  documents,
  inspectors,
  invoices,
  jobComments,
  jobCompletionData,
  jobUpdates,
  jobs,
  stockReadings,
  tanks,
} from "@/db/schema";
import { getStaff } from "@/lib/staff-auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AddDocumentForm,
  CreateInvoiceForm,
  InvoiceReminderButton,
} from "@/components/admin/portal-job-forms";
import {
  AssignInspectorForm,
  ApproveRejectPanel,
  CloseJobButton,
  OverrideStatusForm,
  PaymentActionPanel,
} from "@/components/admin/workflow-forms";
import { AdminJobComments } from "@/components/admin/admin-job-comments";
import { AiReviewBanner } from "@/components/admin/ai-review-banner";
import { loadJobReviews } from "@/lib/ai/document-review";
import {
  DOCUMENT_KIND_META,
  INVOICE_STATUS_META,
  JOB_STATUS_META,
  SERVICE_TYPE_LABEL,
  formatMoney,
  type DocumentKind,
  type InvoiceStatus,
  type JobStatus,
  type ServiceType,
} from "@/lib/jobs";
import { getInvoiceSettings } from "@/lib/settings";

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

export default async function AdminJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();

  const staff = await getStaff();
  if (!staff) notFound();

  const database = requireDb();
  const rows = await database
    .select({ job: jobs, client: clients })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!rows[0]) notFound();
  const job = rows[0].job;
  const client = rows[0].client;

  // Fetched sequentially rather than via Promise.all — firing this many
  // queries concurrently was hanging indefinitely in production (queries
  // completed on the Postgres side but the resolved value never made it
  // back to the awaiting Promise), while the exact same queries run one at
  // a time without issue. Costs a bit of latency, not correctness.
  const timeline = await database.select().from(jobUpdates).where(eq(jobUpdates.jobId, jobId)).orderBy(desc(jobUpdates.createdAt));
  const docs = await database.select().from(documents).where(eq(documents.jobId, jobId)).orderBy(desc(documents.createdAt));
  const bills = await database.select().from(invoices).where(eq(invoices.jobId, jobId)).orderBy(desc(invoices.issuedAt));
  const activeInspectors = await database
    .select({ id: inspectors.id, name: inspectors.name })
    .from(inspectors)
    .where(and(eq(inspectors.active, true), eq(inspectors.status, "active")));
  const assignedInspector = job.assignedInspectorId
    ? await database.select().from(inspectors).where(eq(inspectors.id, job.assignedInspectorId)).limit(1)
    : [];
  const completion = await database.select().from(jobCompletionData).where(eq(jobCompletionData.jobId, jobId)).limit(1);
  const tankList = await database.select().from(tanks).where(eq(tanks.clientId, job.clientId));
  const readings = await database.select().from(stockReadings).where(eq(stockReadings.jobId, jobId)).orderBy(desc(stockReadings.readingDate));
  const coq = await database.select().from(certificates).where(eq(certificates.jobId, jobId)).limit(1);
  const comments = await database.select().from(jobComments).where(eq(jobComments.jobId, jobId)).orderBy(asc(jobComments.createdAt));
  const invoiceSettings = await getInvoiceSettings();
  const aiReviews = await loadJobReviews(jobId);

  const defaultDueDate = new Date();
  defaultDueDate.setDate(defaultDueDate.getDate() + (Number(invoiceSettings.termsDays) || 14));

  const completionReviews = aiReviews.filter((r) => r.targetType === "completion_data");
  const documentReviews = (docId: number) => aiReviews.filter((r) => r.targetType === "document" && r.targetId === docId);
  const receiptReviews = (invoiceId: number) => aiReviews.filter((r) => r.targetType === "receipt" && r.targetId === invoiceId);

  const meta = JOB_STATUS_META[job.status as JobStatus] ?? JOB_STATUS_META.awaiting_assignment;
  const canAssign = job.status === "awaiting_assignment" || job.status === "assigned";
  const canApproveReject = job.status === "awaiting_approval";
  const canClose = job.status === "paid";
  const isAdmin = staff.role === "administrator" || staff.role === "superadmin";
  const cd = completion[0];
  const tankById = new Map(tankList.map((t) => [t.id, t]));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <Link
        href="/admin/jobs"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold-600"
      >
        <ArrowLeft className="h-4 w-4" /> All Jobs
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-display text-sm font-bold tracking-wide text-gold-700">
            {job.ref}
          </span>
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
          {client.company ? ` · ${client.company}` : ""} · Opened{" "}
          {dateFmt.format(new Date(job.createdAt))}
          {assignedInspector[0] ? ` · Inspector: ${assignedInspector[0].name}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {canAssign && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">
                {job.status === "assigned" ? "Reassign Inspector" : "Assign Inspector"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AssignInspectorForm
                jobId={job.id}
                inspectors={activeInspectors}
                isReassign={job.status === "assigned"}
              />
            </CardContent>
          </Card>
        )}

        {canApproveReject && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Review Submitted Work</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <AiReviewBanner reviews={completionReviews} />
              <ApproveRejectPanel jobId={job.id} />
            </CardContent>
          </Card>
        )}

        {canClose && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Close Job</CardTitle>
            </CardHeader>
            <CardContent>
              <CloseJobButton jobId={job.id} />
            </CardContent>
          </Card>
        )}

        {cd && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Completion Data</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Detail label="Started" value={cd.dateTimeStarted ? dateTimeFmt.format(new Date(cd.dateTimeStarted)) : null} />
              <Detail label="Completed" value={cd.dateTimeCompleted ? dateTimeFmt.format(new Date(cd.dateTimeCompleted)) : null} />
              <Detail label="GOV" value={cd.gov} />
              <Detail label="GSV" value={cd.gsv} />
              <Detail label="Metric Tonnes (Air)" value={cd.metricTonnesAir} />
              <Detail label="Metric Tonnes (Vacuum)" value={cd.metricTonnesVacuum} />
              {cd.inspectorComments && (
                <div className="col-span-2">
                  <Detail label="Inspector comments" value={cd.inspectorComments} />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <FileUp className="h-4 w-4" /> Attach Document
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AddDocumentForm jobId={job.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Documents ({docs.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {docs.length === 0 && (
              <p className="m-0 text-sm text-muted-foreground">No documents yet.</p>
            )}
            {docs.map((d) => (
              <div key={d.id} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-sm font-medium text-navy-950">{d.title}</p>
                    <p className="m-0 text-xs text-muted-foreground">
                      {DOCUMENT_KIND_META[(d.kind as DocumentKind) in DOCUMENT_KIND_META ? (d.kind as DocumentKind) : "other"].label}
                      {" · "}
                      {d.fileData ? "uploaded file" : "link"}
                    </p>
                  </div>
                </div>
                <AiReviewBanner reviews={documentReviews(d.id)} />
              </div>
            ))}
            {coq[0] && (
              <a
                href={`/api/certificates/${coq[0].id}/pdf`}
                className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold text-navy-800 transition-colors hover:bg-navy-50"
                style={{ borderColor: "var(--border)" }}
                download
              >
                Download COQ ({coq[0].coqNumber})
              </a>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Invoices</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {bills.length > 0 && (
              <ul className="flex flex-col gap-2">
                {bills.map((inv) => {
                  const invMeta = INVOICE_STATUS_META[inv.status as InvoiceStatus] ?? INVOICE_STATUS_META.pending;
                  return (
                    <li key={inv.id} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-sm font-semibold text-navy-950">{inv.number}</span>
                        <span className="font-display text-sm font-bold tabular-nums">
                          {formatMoney(inv.amountCents, inv.currency)}
                        </span>
                        <Badge variant="secondary" className={invMeta.badgeClass}>
                          {invMeta.label}
                        </Badge>
                        <a
                          href={`/api/portal/invoices/${inv.id}/pdf`}
                          className="ml-auto text-xs font-semibold text-navy-700 underline-offset-2 hover:underline"
                          download
                        >
                          PDF
                        </a>
                      </div>
                      {inv.status === "payment_submitted" && (
                        <div className="flex flex-col gap-2">
                          <a
                            href={`/api/invoices/${inv.id}/receipt`}
                            className="text-xs font-semibold text-navy-700 underline-offset-2 hover:underline"
                            download
                          >
                            View submitted receipt
                          </a>
                          {inv.paymentReference && (
                            <p className="m-0 text-xs text-muted-foreground">Reference: {inv.paymentReference}</p>
                          )}
                          {inv.clientComment && (
                            <p className="m-0 text-xs text-muted-foreground">Client note: {inv.clientComment}</p>
                          )}
                          <AiReviewBanner reviews={receiptReviews(inv.id)} />
                          <PaymentActionPanel jobId={job.id} invoiceId={inv.id} />
                        </div>
                      )}
                      {inv.status !== "paid" && inv.status !== "payment_submitted" && (
                        <InvoiceReminderButton invoiceId={inv.id} jobId={job.id} />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <CreateInvoiceForm
              jobId={job.id}
              defaultCurrency={invoiceSettings.defaultCurrency}
              defaultDueDate={defaultDueDate.toISOString().slice(0, 10)}
            />
          </CardContent>
        </Card>

        {tankList.length > 0 && job.serviceType === "stock_monitoring" && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Stock Readings ({readings.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {readings.length === 0 && (
                <p className="m-0 text-sm text-muted-foreground">No stock readings logged yet.</p>
              )}
              {readings.map((r) => (
                <div key={r.id} className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--border)" }}>
                  <p className="m-0 font-semibold text-navy-950">
                    {tankById.get(r.tankId)?.name ?? `Tank #${r.tankId}`} — {dateFmt.format(new Date(r.readingDate))}
                  </p>
                  <p className="m-0 text-xs text-muted-foreground">
                    Opening {r.openingStock ?? "—"} · Receipts {r.receipts ?? "—"} · Transfers {r.transfers ?? "—"} ·
                    {" "}Discharges/Loads {r.dischargesLoads ?? "—"} · Closing {r.closingStock ?? "—"} · GSV {r.gsv ?? "—"}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Manual Override</CardTitle>
            </CardHeader>
            <CardContent>
              <OverrideStatusForm jobId={job.id} current={job.status} />
            </CardContent>
          </Card>
        )}

      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Comments</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminJobComments jobId={job.id} comments={comments} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Update History</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
            {timeline.map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline gap-x-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm font-semibold text-navy-950">
                  {(JOB_STATUS_META[u.status as JobStatus] ?? JOB_STATUS_META.awaiting_assignment).label}
                </span>
                <span className="text-xs text-ink-faint">
                  {dateFmt.format(new Date(u.createdAt))} · {u.actorName}
                </span>
                {u.note && <span className="w-full text-sm text-ink-soft">{u.note}</span>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-[0.06em] uppercase text-ink-faint">
        {label}
      </dt>
      <dd className="m-0 mt-0.5 text-sm text-navy-950">{value || "—"}</dd>
    </div>
  );
}
