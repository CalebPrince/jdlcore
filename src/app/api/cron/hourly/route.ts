import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/automation/cron-auth";
import { recordRuns, runTask } from "@/lib/automation/run";
import { runAutoAssignSweep } from "@/lib/automation/auto-assign";
import { runAutoApprove } from "@/lib/automation/auto-approve";
import { retryFailedEmails } from "@/lib/email";

export const maxDuration = 60;

/**
 * Light, time-sensitive subset of the daily job: moving an unanswered assignment on, approving jobs
 * once their waiting period is over, and retrying failed emails. Vercel's plan only schedules once a
 * day, so this is called every hour by a GitHub Actions schedule (.github/workflows/hourly-automation.yml)
 * using the same CRON_SECRET. Everything here is idempotent, and the daily run still does the same
 * tasks as a fallback, so if the hourly schedule isn't set up nothing is lost, only slower.
 */
export async function GET(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;

  const tasks = [
    await runTask("auto-assign", runAutoAssignSweep),
    await runTask("auto-approve", runAutoApprove),
    await runTask("email-retry", () => retryFailedEmails()),
  ];
  await recordRuns("hourly", tasks);
  const ok = tasks.every((t) => t.ok);
  return NextResponse.json({ ok, tasks }, { status: ok ? 200 : 500 });
}
