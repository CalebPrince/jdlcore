import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft, FileUp } from "lucide-react";
import { requireDb } from "@/db";
import {
  clients,
  documents,
  invoices,
  jobUpdates,
  jobs,
} from "@/db/schema";
import { markInvoicePaid } from "@/app/actions/portal-admin";
import { Button } from "@/components/ui/button";
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
  StatusUpdateForm,
} from "@/components/admin/portal-job-forms";
import {
  DOCUMENT_KIND_META,
  JOB_STATUS_META,
  formatMoney,
  type DocumentKind,
  type JobStatus,
} from "@/lib/jobs";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function AdminJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();

  let job;
  let client;
  let timeline;
  let docs;
  let bills;
  try {
    const database = requireDb();
    const rows = await database
      .select({ job: jobs, client: clients })
      .from(jobs)
      .innerJoin(clients, eq(jobs.clientId, clients.id))
      .where(eq(jobs.id, jobId))
      .limit(1);
    if (!rows[0]) notFound();
    job = rows[0].job;
    client = rows[0].client;

    [timeline, docs, bills] = await Promise.all([
      database
        .select()
        .from(jobUpdates)
        .where(eq(jobUpdates.jobId, jobId))
        .orderBy(desc(jobUpdates.createdAt)),
      database
        .select()
        .from(documents)
        .where(eq(documents.jobId, jobId))
        .orderBy(desc(documents.createdAt)),
      database
        .select()
        .from(invoices)
        .where(eq(invoices.jobId, jobId))
        .orderBy(desc(invoices.issuedAt)),
    ]);
  } catch (e) {
    throw e;
  }

  const meta = JOB_STATUS_META[job.status as JobStatus] ?? JOB_STATUS_META.submitted;

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
        </div>
        <h1 className="mb-1 mt-2 font-display text-xl font-bold text-navy-950">
          {job.service}
          {job.location ? ` — ${job.location}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {client.name}
          {client.company ? ` · ${client.company}` : ""} · Opened{" "}
          {dateFmt.format(new Date(job.createdAt))}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Post Status Update</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusUpdateForm jobId={job.id} current={job.status} />
          </CardContent>
        </Card>

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
              <div key={d.id} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-medium text-navy-950">{d.title}</p>
                  <p className="m-0 text-xs text-muted-foreground">
                    {DOCUMENT_KIND_META[(d.kind as DocumentKind) in DOCUMENT_KIND_META ? (d.kind as DocumentKind) : "other"].label}
                    {" · "}
                    {d.fileData ? "uploaded file" : "link"}
                  </p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Invoices</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {bills.length > 0 && (
              <ul className="flex flex-col gap-2">
                {bills.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                    <span className="text-sm font-semibold text-navy-950">{inv.number}</span>
                    <span className="font-display text-sm font-bold tabular-nums">
                      {formatMoney(inv.amountCents, inv.currency)}
                    </span>
                    <Badge
                      variant="secondary"
                      className={
                        inv.status === "paid"
                          ? "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]"
                          : undefined
                      }
                    >
                      {inv.status === "paid" ? "Paid" : inv.status === "sent" ? "Sent" : "Draft"}
                    </Badge>
                    {inv.status !== "paid" && (
                      <form action={markInvoicePaid} className="ml-auto">
                        <input type="hidden" name="invoiceId" value={inv.id} />
                        <input type="hidden" name="jobId" value={job.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Mark paid
                        </Button>
                      </form>
                    )}
                    <a
                      href={`/api/portal/invoices/${inv.id}/pdf`}
                      className={`text-xs font-semibold text-navy-700 underline-offset-2 hover:underline ${inv.status !== "paid" ? "" : "ml-auto"}`}
                      download
                    >
                      PDF
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <CreateInvoiceForm jobId={job.id} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Update History</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
            {timeline.map((u) => (
              <li key={u.id} className="flex flex-wrap items-baseline gap-x-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-sm font-semibold text-navy-950">
                  {(JOB_STATUS_META[u.status as JobStatus] ?? JOB_STATUS_META.submitted).label}
                </span>
                <span className="text-xs text-ink-faint">
                  {dateFmt.format(new Date(u.createdAt))}
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
