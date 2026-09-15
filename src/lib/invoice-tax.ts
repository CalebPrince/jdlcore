import "server-only";

/**
 * Ghana-specific levies applied to domestic (GHS) invoices: NHIL (National Health
 * Insurance Levy) and GETFund (Ghana Education Trust Fund) at 2.5% each, plus VAT at
 * 15% — each computed independently on the pre-tax subtotal and added on top to reach
 * the amount actually due. Not applied to USD invoices (international clients aren't
 * subject to these domestic levies).
 */
export const NHIL_RATE = 0.025;
export const GETFUND_RATE = 0.025;
export const VAT_RATE = 0.15;

export type InvoiceTaxBreakdown = {
  subtotalCents: number;
  nhilCents: number;
  getfundCents: number;
  vatCents: number;
  totalCents: number;
};

/** Returns null for non-GHS currencies — the subtotal stands as the total, no breakdown. */
export function computeInvoiceTotal(subtotalCents: number, currency: string): InvoiceTaxBreakdown | null {
  if (currency !== "GHS") return null;
  const nhilCents = Math.round(subtotalCents * NHIL_RATE);
  const getfundCents = Math.round(subtotalCents * GETFUND_RATE);
  const vatCents = Math.round(subtotalCents * VAT_RATE);
  return {
    subtotalCents,
    nhilCents,
    getfundCents,
    vatCents,
    totalCents: subtotalCents + nhilCents + getfundCents + vatCents,
  };
}
