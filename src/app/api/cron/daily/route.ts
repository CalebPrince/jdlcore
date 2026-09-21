import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/automation/cron-auth";
import { runTask } from "@/lib/automation/run";
import { runInvoiceReminders } from "@/lib/automation/invoice-reminders";
import { runOpsDigest } from "@/lib/automation/ops-digest";
import { runAutoClose } from "@/lib/automation/auto-close";
import { runPaystackReconcile } from "@/lib/automation/paystack-reconcile";
import { runSubscriptionSweep } from "@/lib/automation/subscription-sweep";
import { runSchemaCheck } from "@/lib/automation/schema-check";
import { retryFailedEmails } from "@/lib/email";

export const maxDuration = 60;

/**
 * Daily dispatcher (see vercel.json). Each task is independent, idempotent, and isolated,
 * so one failing never blocks the rest and a re-run never double-notifies. Bank-transfer
 * receipt verification is never touched: that stays a manual staff decision. (The Paystack
 * reconcile only re-runs the existing Paystack-confirmed path for payments the webhook missed.)
 */
export async function GET(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;

  // Order matters a little: recover missed payments first so the reminders, digest and
  // auto-close below all see the corrected state; retry failed emails last so it also
  // picks up anything the earlier tasks just failed to send.
  const tasks = [
    await runTask("schema-check", runSchemaCheck),
    await runTask("paystack-reconcile", runPaystackReconcile),
    await runTask("subscription-sweep", runSubscriptionSweep),
    await runTask("invoice-reminders", runInvoiceReminders),
    await runTask("ops-digest", runOpsDigest),
    await runTask("auto-close", runAutoClose),
    await runTask("email-retry", () => retryFailedEmails()),
  ];
  return NextResponse.json({ ok: tasks.every((t) => t.ok), tasks });
}
