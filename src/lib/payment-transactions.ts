import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, requireDb } from "@/db";
import { paymentTransactions } from "@/db/schema";

export type TransactionKind = "invoice" | "analytics_subscription" | "academy_subscription";
export type TransactionStatus = "success" | "failed" | "canceled" | "mismatch";

export type PaymentTransactionSummary = {
  successCents: number;
  successCount: number;
  failedCents: number;
  failedCount: number;
  canceledCents: number;
  canceledCount: number;
  mismatchCents: number;
  mismatchCount: number;
  totalCount: number;
};

const EMPTY_SUMMARY: PaymentTransactionSummary = {
  successCents: 0,
  successCount: 0,
  failedCents: 0,
  failedCount: 0,
  canceledCents: 0,
  canceledCount: 0,
  mismatchCents: 0,
  mismatchCount: 0,
  totalCount: 0,
};

/** Records one Paystack charge outcome to the ledger. Never throws — logging must not break the payment flow it's observing. */
export async function logPaymentTransaction(input: {
  kind: TransactionKind;
  status: TransactionStatus;
  reference: string;
  amountCents: number;
  currency: string;
  description: string;
  payerEmail?: string | null;
  invoiceId?: number | null;
  analyticsUserId?: number | null;
}): Promise<void> {
  try {
    await requireDb().insert(paymentTransactions).values({
      kind: input.kind,
      status: input.status,
      reference: input.reference,
      amountCents: input.amountCents,
      currency: input.currency,
      description: input.description,
      payerEmail: input.payerEmail ?? null,
      invoiceId: input.invoiceId ?? null,
      analyticsUserId: input.analyticsUserId ?? null,
    });
  } catch (err) {
    console.error("logPaymentTransaction:", err);
  }
}

export async function recentPaymentTransactions(limit = 50) {
  if (!db) return [];
  try {
    return await db.select().from(paymentTransactions).orderBy(desc(paymentTransactions.createdAt)).limit(limit);
  } catch {
    return [];
  }
}

export async function academyPaymentsForEmail(email: string, limit = 20) {
  if (!db) return [];
  try {
    return await db.select().from(paymentTransactions)
      .where(and(eq(paymentTransactions.kind, "academy_subscription"), eq(paymentTransactions.payerEmail, email)))
      .orderBy(desc(paymentTransactions.createdAt)).limit(limit);
  } catch { return []; }
}

export async function paymentTransactionTotals(): Promise<PaymentTransactionSummary> {
  if (!db) return { ...EMPTY_SUMMARY };
  try {
    const rows = await db
      .select({
        status: paymentTransactions.status,
        amountCents: sql<number>`coalesce(sum(${paymentTransactions.amountCents}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(paymentTransactions)
      .groupBy(paymentTransactions.status);

    const summary = { ...EMPTY_SUMMARY };
    for (const row of rows) {
      summary.totalCount += row.count;
      if (row.status === "success") {
        summary.successCents = row.amountCents;
        summary.successCount = row.count;
      } else if (row.status === "failed") {
        summary.failedCents = row.amountCents;
        summary.failedCount = row.count;
      } else if (row.status === "canceled" || row.status === "cancelled") {
        summary.canceledCents += row.amountCents;
        summary.canceledCount += row.count;
      } else if (row.status === "mismatch") {
        summary.mismatchCents = row.amountCents;
        summary.mismatchCount = row.count;
      }
    }
    return summary;
  } catch {
    return { ...EMPTY_SUMMARY };
  }
}
