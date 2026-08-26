export const JOB_STATUSES = [
  "awaiting_assignment",
  "assigned",
  "inspector_accepted",
  "in_progress",
  "awaiting_approval",
  "rejected_amendment",
  "approved",
  "report_issued",
  "invoice_issued",
  "paid",
  "closed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_META: Record<
  JobStatus,
  { label: string; description: string; badgeClass: string }
> = {
  awaiting_assignment: {
    label: "Awaiting Assignment",
    description: "Request received — waiting for Operations to assign an inspector.",
    badgeClass: "bg-navy-100 text-navy-800",
  },
  assigned: {
    label: "Assigned",
    description: "An inspector has been assigned and is reviewing the job.",
    badgeClass: "bg-[rgba(201,142,18,0.14)] text-gold-700",
  },
  inspector_accepted: {
    label: "Inspector Accepted",
    description: "The inspector has accepted the assignment.",
    badgeClass: "bg-[rgba(201,142,18,0.14)] text-gold-700",
  },
  in_progress: {
    label: "In Progress",
    description: "Field work is underway.",
    badgeClass: "bg-[rgba(201,142,18,0.14)] text-gold-700",
  },
  awaiting_approval: {
    label: "Awaiting Operations Approval",
    description: "Completed work has been submitted and is awaiting review.",
    badgeClass: "bg-[rgba(201,142,18,0.14)] text-gold-700",
  },
  rejected_amendment: {
    label: "Rejected / Amendment Required",
    description: "Operations returned this job to the inspector for changes.",
    badgeClass: "bg-red-500/10 text-red-700",
  },
  approved: {
    label: "Approved",
    description: "Operations approved the completed work.",
    badgeClass: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  },
  report_issued: {
    label: "Report Issued",
    description: "The Certificate of Quantity is available for download.",
    badgeClass: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  },
  invoice_issued: {
    label: "Invoice Issued",
    description: "An invoice has been issued and is awaiting payment.",
    badgeClass: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  },
  paid: {
    label: "Paid",
    description: "Payment has been verified in full.",
    badgeClass: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  },
  closed: {
    label: "Closed",
    description: "Job completed and archived.",
    badgeClass: "bg-ink-faint/10 text-ink-soft",
  },
};

export const DOCUMENT_KINDS = ["report", "coq", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_META: Record<DocumentKind, { label: string }> = {
  report: { label: "Inspection Report" },
  coq: { label: "Certificate of Quantity" },
  other: { label: "Other Document" },
};

export const INVOICE_STATUSES = [
  "pending",
  "payment_submitted",
  "payment_verified",
  "paid",
  "payment_rejected",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_META: Record<
  InvoiceStatus,
  { label: string; badgeClass: string }
> = {
  pending: { label: "Pending", badgeClass: "bg-navy-100 text-navy-800" },
  payment_submitted: {
    label: "Payment Submitted",
    badgeClass: "bg-[rgba(201,142,18,0.14)] text-gold-700",
  },
  payment_verified: {
    label: "Payment Verified",
    badgeClass: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  },
  paid: { label: "Paid", badgeClass: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]" },
  payment_rejected: { label: "Payment Rejected", badgeClass: "bg-red-500/10 text-red-700" },
};

export const SERVICE_TYPES = [
  "stock_monitoring",
  "collateral_verification",
  "tank_depot_inspection",
  "quantity_verification",
  "reconciliation_exception",
  "loading_discharge_supervision",
  "inventory_audit",
  "loss_discrepancy_investigation",
  "documentation_reporting",
  "stock_control_advisory",
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  stock_monitoring: "Stock Monitoring Services",
  collateral_verification: "Collateral Verification Services",
  tank_depot_inspection: "Tank and Depot Inspections",
  quantity_verification: "Quantity Verification",
  reconciliation_exception: "Reconciliation & Exception Reporting",
  loading_discharge_supervision: "Loading & Discharge Supervision",
  inventory_audit: "Inventory Audit Support",
  loss_discrepancy_investigation: "Loss & Discrepancy Investigation",
  documentation_reporting: "Documentation & Reporting",
  stock_control_advisory: "Stock Control Advisory",
};

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

export function makeInvoiceNumber(id: number, prefix = "INV"): string {
  return `${prefix}-${new Date().getFullYear()}-${String(id).padStart(4, "0")}`;
}

export function makeCoqNumber(id: number, prefix = "COQ"): string {
  return `${prefix}-${new Date().getFullYear()}-${String(id).padStart(4, "0")}`;
}
