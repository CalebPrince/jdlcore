import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, Download, ReceiptText } from "lucide-react";
import { requireDb } from "@/db";
import { documents, invoices, jobUpdates, jobs } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import {
  DOCUMENT_KIND_META,
  INVOICE_STATUS_META,
  JOB_STATUS_META,
  formatMoney,
  type DocumentKind,
  type InvoiceStatus,
  type JobStatus,
} from "@/lib/jobs";

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

export default async function PortalJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();

  const client = await getPortalClient();
  if (!client) return null;

  let job;
  let timeline;
  let docs;
  let bills;
  const database = requireDb();
  {
    const rows = await database
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.clientId, client.id)))
      .limit(1);
    job = rows[0];
    if (!job) notFound();

    [timeline, docs, bills] = await Promise.all([
      database
        .select()
        .from(jobUpdates)
        .where(eq(jobUpdates.jobId, jobId))
        .orderBy(asc(jobUpdates.createdAt)),
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
  }

  const meta =
    JOB_STATUS_META[job.status as JobStatus] ?? JOB_STATUS_META.awaiting_assignment;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/portal"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold-600"
      >
        <ArrowLeft className="h-4 w-4" /> Back to My Jobs
      </Link>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-display text-sm font-bold tracking-wide text-gold-700">
          {job.ref}
        </span>
        <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${meta.badgeClass}`}>
          {meta.label}
        </span>
      </div>
      <p className="m-0 -mt-3 text-sm text-muted-foreground">{meta.description}</p>

      <section className="grid grid-cols-1 gap-x-8 gap-y-2 rounded-[var(--radius)] border bg-white p-6 sm:grid-cols-2" style={{ borderColor: "var(--border)" }}>
        <Detail label="Service" value={job.service} />
        <Detail label="Location" value={job.location} />
        <Detail label="Cargo type" value={job.cargoType} />
        <Detail label="Opened" value={dateFmt.format(new Date(job.createdAt))} />
        {job.notes && (
          <div className="sm:col-span-2">
            <Detail label="Scope notes" value={job.notes} />
          </div>
        )}
      </section>

      {/* Documents */}
      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-display text-lg font-bold text-navy-950">Documents</h2>
        {docs.length === 0 ? (
          <EmptyNote>Reports and Certificates of Quantity will appear here when published by the JDL Core team.</EmptyNote>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-4 rounded-[var(--radius)] border bg-white p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-semibold text-navy-950">{d.title}</p>
                  <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                    {DOCUMENT_KIND_META[(d.kind as DocumentKind) in DOCUMENT_KIND_META ? (d.kind as DocumentKind) : "other"].label}
                    {" · "}
                    {dateFmt.format(new Date(d.createdAt))}
                  </p>
                </div>
                <a
                  href={`/api/portal/documents/${d.id}`}
                  className="btn-gold shrink-0 px-[1.1em] py-[0.55em] text-[0.82rem]"
                >
                  <Download className="mr-1.5 inline h-3.5 w-3.5" />
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Invoices */}
      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-display text-lg font-bold text-navy-950">Invoices</h2>
        {bills.length === 0 ? (
          <EmptyNote>Invoices for this job will appear here.</EmptyNote>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {bills.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[var(--radius)] border bg-white p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <ReceiptText className="h-5 w-5 shrink-0 text-navy-700" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-semibold text-navy-950">{inv.number}</p>
                  <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                    Issued {dateFmt.format(new Date(inv.issuedAt))}
                    {inv.dueDate ? ` · Due ${dateFmt.format(new Date(inv.dueDate))}` : ""}
                  </p>
                </div>
                <span className="font-display text-base font-bold tabular-nums text-navy-950">
                  {formatMoney(inv.amountCents, inv.currency)}
                </span>
                <span
                  className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                    (INVOICE_STATUS_META[inv.status as InvoiceStatus] ?? INVOICE_STATUS_META.pending)
                      .badgeClass
                  }`}
                >
                  {(INVOICE_STATUS_META[inv.status as InvoiceStatus] ?? INVOICE_STATUS_META.pending)
                    .label}
                </span>
                <a
                  href={`/api/portal/invoices/${inv.id}/pdf`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold text-navy-800 transition-colors hover:bg-navy-50"
                  style={{ borderColor: "var(--border)" }}
                  download
                >
                  <Download className="h-3.5 w-3.5" />
                  PDF
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Timeline */}
      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-display text-lg font-bold text-navy-950">Progress Timeline</h2>
        <ol className="relative m-0 list-none border-l-2 pl-6" style={{ borderColor: "rgba(201,142,18,0.35)" }}>
          {[...timeline].reverse().map((u, i) => {
            const um = JOB_STATUS_META[u.status as JobStatus] ?? JOB_STATUS_META.awaiting_assignment;
            return (
              <li key={u.id} className={`relative pb-6 last:pb-0 ${i === 0 ? "" : ""}`}>
                <span
                  aria-hidden="true"
                  className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                    i === 0 ? "bg-gold-600" : "bg-navy-300"
                  }`}
                  style={{ boxShadow: "0 0 0 1px rgba(201,142,18,0.35)" }}
                />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-sm font-bold text-navy-950">{um.label}</span>
                  <span className="text-xs text-ink-faint">
                    {dateTimeFmt.format(new Date(u.createdAt))}
                  </span>
                </div>
                {u.note && (
                  <p className="mb-0 mt-1 text-sm text-ink-soft">{u.note}</p>
                )}
              </li>
            );
          })}
        </ol>
      </section>
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

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-0 rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground" style={{ borderColor: "var(--border)" }}>
      {children}
    </p>
  );
}
