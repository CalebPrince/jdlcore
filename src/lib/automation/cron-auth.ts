import "server-only";
import { NextResponse } from "next/server";

/**
 * Shared guard for scheduled routes. Vercel Cron signs its requests with
 * `Authorization: Bearer $CRON_SECRET`. These routes write to the DB and email real
 * people, so they refuse to run at all when the secret isn't configured.
 */
export function cronAuthError(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
