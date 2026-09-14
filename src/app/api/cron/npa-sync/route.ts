import { NextResponse } from "next/server";
import { syncNpaKnowledge } from "@/lib/analytics-npa-sync";

// Hint to the host to allow a longer-running function here (capped to whatever the
// hosting plan actually permits) since this fetches + parses several external files.
export const maxDuration = 60;

/**
 * Vercel Cron hits this daily (see vercel.json) to pull any new NPA document into the
 * Analytics knowledge base automatically — no one has to paste a link. Vercel signs
 * its own cron requests with `Authorization: Bearer $CRON_SECRET`; requires that env
 * var to be set in production or this route refuses to run (it fetches external URLs
 * and writes to the DB, so it shouldn't be left open to the public internet).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncNpaKnowledge({ maxDocuments: 30, maxMs: 45_000 });
  return NextResponse.json(result);
}
