import { NextResponse } from "next/server";
import { finalizePaystackPayment } from "@/lib/paystack-payments";

/**
 * Where Paystack redirects the browser back to after a checkout attempt. This is a
 * convenience for instant UI feedback, not the source of truth — finalizePaystackPayment
 * re-verifies against Paystack itself and is idempotent, so it's safe even if the
 * webhook already processed this same reference first.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const reference = url.searchParams.get("reference") || url.searchParams.get("trxref");
  if (!reference) return NextResponse.redirect(new URL("/portal", req.url));

  const result = await finalizePaystackPayment(reference);

  switch (result.outcome) {
    case "paid":
    case "already_paid":
      return NextResponse.redirect(new URL(`/portal/jobs/${result.jobId}?payment=success`, req.url));
    case "mismatch":
      return NextResponse.redirect(new URL(`/portal/jobs/${result.jobId}?payment=review`, req.url));
    case "not_success":
      return NextResponse.redirect(new URL("/portal?payment=failed", req.url));
    default:
      return NextResponse.redirect(new URL("/portal?payment=failed", req.url));
  }
}
