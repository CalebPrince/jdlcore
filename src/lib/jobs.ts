export const JOB_STATUSES = [
  "submitted",
  "assigned",
  "in_progress",
  "verification",
  "report_ready",
  "closed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_META: Record<
  JobStatus,
  { label: string; description: string; badgeClass: string }
> = {
  submitted: {
    label: "Submitted",
    description: "Request received and under review.",
    badgeClass: "bg-navy-100 text-navy-800",
  },
  assigned: {
    label: "Assigned",
    description: "An inspector has been assigned to the job.",
    badgeClass: "bg-[rgba(201,142,18,0.14)] text-gold-700",
  },
  in_progress: {
    label: "In Progress",
    description: "Field work is underway.",
    badgeClass: "bg-[rgba(201,142,18,0.14)] text-gold-700",
  },
  verification: {
    label: "Verification",
    description: "Readings are being verified and reconciled.",
    badgeClass: "bg-[rgba(201,142,18,0.14)] text-gold-700",
  },
  report_ready: {
    label: "Report Ready",
    description: "Final report and documents are available for download.",
    badgeClass: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  },
  closed: {
    label: "Closed",
    description: "Job completed and archived.",
    badgeClass: "bg-ink-faint/10 text-ink-soft",
  },
  cancelled: {
    label: "Cancelled",
    description: "This request was cancelled.",
    badgeClass: "bg-red-500/10 text-red-700",
  },
};

export const DOCUMENT_KINDS = ["report", "coq", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_META: Record<DocumentKind, { label: string }> = {
  report: { label: "Inspection Report" },
  coq: { label: "Certificate of Quantity" },
  other: { label: "Other Document" },
};

export const INVOICE_STATUSES = ["draft", "sent", "paid"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

export function makeRef(id: number): string {
  return `JDL-${new Date().getFullYear()}-${String(id).padStart(4, "0")}`;
}

export function makeInvoiceNumber(id: number): string {
  return `INV-${new Date().getFullYear()}-${String(id).padStart(4, "0")}`;
}
