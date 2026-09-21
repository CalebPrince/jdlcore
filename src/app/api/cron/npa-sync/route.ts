import { NextResponse } from "next/server";
import { syncNpaKnowledge } from "@/lib/analytics-npa-sync";
import { alertOnNpaSyncHealth } from "@/lib/automation/npa-health";
import { cronAuthError } from "@/lib/automation/cron-auth";
import { runTask } from "@/lib/automation/run";

// Hint to the host to allow a longer-running function here (capped to whatever the
// hosting plan actually permits) since this fetches + parses several external files.
export const maxDuration = 60;

/**
 * Vercel Cron hits this daily (see vercel.json) to pull any new NPA document into the
 * Analytics knowledge base automatically, so no one has to paste a link. After the crawl
 * it checks its own health and alerts staff (failed files, unlistable sources, a week
 * with nothing new) instead of leaving problems to be found by hand-run SQL.
 */
export async function GET(req: Request) {
  const denied = cronAuthError(req);
  if (denied) return denied;

  const result = await syncNpaKnowledge({ maxDocuments: 30, maxMs: 45_000 });
  const health = await runTask("npa-health", () => alertOnNpaSyncHealth(result));
  return NextResponse.json({ ...result, health });
}
