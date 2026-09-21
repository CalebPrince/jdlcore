import "server-only";
import { and, isNotNull, ne } from "drizzle-orm";
import { requireDb } from "@/db";
import { invoices } from "@/db/schema";
import { verifyTransaction } from "@/lib/paystack";
import { finalizePaystackPayment } from "@/lib/paystack-payments";

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 7;
const MAX_PER_RUN = 15;

/**
 * Safety net for the Paystack webhook, which acknowledges 200 even when its handler throws
 * (so Paystack never retries). Looks at unpaid invoices where a client started an online
 * payment in the last week and asks Paystack itself what happened. Only a transaction
 * Paystack reports as successful is passed to finalizePaystackPayment, the same
 * idempotent, amount-checked path the webhook uses; an amount mismatch still goes to
 * staff for manual review, and abandoned or failed attempts are left alone (no client
 * spam). Bank-transfer receipts are not touched: those stay a manual staff decision.
 */
export async function runPaystackReconcile() {
  const rows = await requireDb()
    .select({ id: invoices.id, reference: invoices.paystackReference, comment: invoices.clientComment })
    .from(invoices)
    .where(and(ne(invoices.status, "paid"), isNotNull(invoices.paystackReference)));

  const cutoff = Date.now() - LOOKBACK_DAYS * DAY_MS;
  let checked = 0;
  let recovered = 0;
  let mismatched = 0;

  for (const row of rows) {
    if (checked >= MAX_PER_RUN) break;
    const reference = row.reference!;
    // Already flagged for manual review by an earlier run or the webhook: don't re-notify daily.
    if (row.comment?.startsWith("Paystack amount mismatch")) continue;
    // Reference format is jdl-inv-<invoiceId>-<epoch ms>; ignore anything older than the window.
    const started = Number(reference.split("-").pop());
    if (!Number.isFinite(started) || started < cutoff) continue;

    checked += 1;
    const verified = await verifyTransaction(reference);
    if (!verified.ok || verified.status !== "success") continue;

    const result = await finalizePaystackPayment(reference);
    if (result.outcome === "paid") recovered += 1;
    else if (result.outcome === "mismatch") mismatched += 1;
  }

  return { checked, recovered, mismatched };
}
