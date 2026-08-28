import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, requireDb } from "@/db";
import { paymentTransactions } from "@/db/schema";

export type TransactionKind = "invoice" | "analytics_subscription";
export type TransactionStatus = "success" | "failed" | "mismatch";

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

export async function paymentTransactionTotals(): Promise<{ successCents: number; successCount: number }> {
  if (!db) return { successCents: 0, successCount: 0 };
  try {
    const rows = await db
      .select({ amountCents: paymentTransactions.amountCents })
      .from(paymentTransactions)
      .where(eq(paymentTransactions.status, "success"));
    return { successCents: rows.reduce((sum, r) => sum + r.amountCents, 0), successCount: rows.length };
  } catch {
    return { successCents: 0, successCount: 0 };
  }
}
