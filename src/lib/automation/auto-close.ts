import "server-only";
import { and, eq, exists, lt, notExists, ne } from "drizzle-orm";
import { requireDb } from "@/db";
import { certificates, invoices, jobUpdates, jobs } from "@/db/schema";
import { canTransition, type Actor } from "@/lib/job-workflow";
import type { JobStatus } from "@/lib/jobs";

/** Grace period after payment so staff can still spot a problem before the job is archived. */
const CLOSE_AFTER_HOURS = 48;
const SYSTEM_ACTOR: Actor = { type: "system", id: 0, name: "JDL Core" };

/**
 * Closes jobs that are finished in every way that matters: status `paid` (set by Paystack or
 * by staff verifying a receipt, so verification itself is untouched), the Certificate of
 * Quantity has been issued, at least one invoice is paid, and no invoice is still open.
 * Nothing about payment is decided here; this only removes the last "click Close" chore.
 */
export async function runAutoClose() {
  const database = requireDb();
  const cutoff = new Date(Date.now() - CLOSE_AFTER_HOURS * 60 * 60 * 1000);

  const candidates = await database
    .select({ id: jobs.id, status: jobs.status })
    .from(jobs)
    .where(
      and(
        eq(jobs.status, "paid"),
        lt(jobs.updatedAt, cutoff),
        exists(database.select({ one: certificates.id }).from(certificates).where(eq(certificates.jobId, jobs.id))),
        exists(
          database
            .select({ one: invoices.id })
            .from(invoices)
            .where(and(eq(invoices.jobId, jobs.id), eq(invoices.status, "paid"))),
        ),
        notExists(
          database
            .select({ one: invoices.id })
            .from(invoices)
            .where(and(eq(invoices.jobId, jobs.id), ne(invoices.status, "paid"))),
        ),
      ),
    );

  let closed = 0;
  for (const job of candidates) {
    if (!canTransition(job.status as JobStatus, "closed", SYSTEM_ACTOR)) continue;
    const now = new Date();
    const updated = await database
      .update(jobs)
      .set({ status: "closed", closedAt: now, updatedAt: now })
      .where(and(eq(jobs.id, job.id), eq(jobs.status, "paid")))
      .returning({ id: jobs.id });
    if (updated.length === 0) continue;
    await database.insert(jobUpdates).values({
      jobId: job.id,
      status: "closed",
      note: "Closed automatically: payment received and Certificate of Quantity delivered.",
      actorType: "system",
      actorId: null,
      actorName: "JDL Core",
    });
    closed += 1;
  }
  return { candidates: candidates.length, closed };
}
