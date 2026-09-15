import { NextResponse } from "next/server";
import { finalizeAcademyCheckout } from "@/lib/academy-billing";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref");
  if (!reference) return NextResponse.redirect(new URL("/academy/subscribe?error=failed", request.url));
  const active = await finalizeAcademyCheckout(reference);
  return NextResponse.redirect(new URL(active ? "/academy/lms?welcome=1" : "/academy/subscribe?error=failed", request.url));
}
