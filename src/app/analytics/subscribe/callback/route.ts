import { NextResponse } from "next/server";
import { finalizeAnalyticsCheckout } from "@/lib/analytics-billing";

/**
 * Where Paystack redirects the browser back to after a subscription checkout attempt.
 * Convenience for instant UX (auto-login) — finalizeAnalyticsCheckout re-verifies
 * against Paystack itself and is idempotent, safe even if the webhook already
 * processed this same reference first.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");
  if (!reference) return NextResponse.redirect(new URL("/analytics", req.url));

  const result = await finalizeAnalyticsCheckout(reference);

  switch (result.outcome) {
    case "activated":
    case "already_active":
      return NextResponse.redirect(new URL("/analytics/app?welcome=1", req.url));
    case "mismatch":
      return NextResponse.redirect(new URL("/analytics/subscribe?error=review", req.url));
    default:
      return NextResponse.redirect(new URL("/analytics/subscribe?error=failed", req.url));
  }
}
