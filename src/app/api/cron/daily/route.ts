import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/automation/cron-auth";
import { recordRuns, runTask } from "@/lib/automation/run";
import { runInvoiceReminders } from "@/lib/automation/invoice-reminders";
import { runOpsDigest } from "@/lib/automation/ops-digest";
import { runAutoClose } from "@/lib/automation/auto-close";
import { runPaystackReconcile } from "@/lib/automation/paystack-reconcile";
import { runSubscriptionSweep } from "@/lib/automation/subscription-sweep";
import { runSchemaCheck } from "@/lib/automation/schema-check";
import { runAutoAssignSweep } from "@/lib/automation/auto-assign";
import { runAutoApprove } from "@/lib/automation/auto-approve";
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
    await runTask("auto-assign", runAutoAssignSweep),
    await runTask("auto-approve", runAutoApprove),
    await runTask("invoice-reminders", runInvoiceReminders),
    await runTask("ops-digest", runOpsDigest),
    await runTask("auto-close", runAutoClose),
    await runTask("email-retry", () => retryFailedEmails()),
  ];
  // A failed task makes the whole run report as failed (HTTP 500), so it shows up in Vercel's cron
  // history and logs, which is where problems for the developer belong, not in the admin screens.
  await recordRuns("daily", tasks);
  const ok = tasks.every((t) => t.ok);
  return NextResponse.json({ ok, tasks }, { status: ok ? 200 : 500 });
}
