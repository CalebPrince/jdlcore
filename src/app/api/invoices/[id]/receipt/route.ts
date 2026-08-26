import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { invoices, jobs } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { getStaff } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const portal = await getPortalClient();
  const staff = portal ? null : await getStaff();
  if (!portal && !staff) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId)) return new NextResponse("Not found", { status: 404 });

  const database = requireDb();
  const rows = await database
    .select({ invoice: invoices })
    .from(invoices)
    .innerJoin(jobs, eq(invoices.jobId, jobs.id))
    .where(
      portal
        ? and(eq(invoices.id, invoiceId), eq(jobs.clientId, portal.id))
        : eq(invoices.id, invoiceId),
    )
    .limit(1);
  const entry = rows[0];
  if (!entry || !entry.invoice.receiptFileData) return new NextResponse("Not found", { status: 404 });

  const { invoice } = entry;
  const base64 = invoice.receiptFileData!.includes(",")
    ? invoice.receiptFileData!.split(",")[1]
    : invoice.receiptFileData!;
  const bytes = Buffer.from(base64, "base64");
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": invoice.receiptMimeType ?? "application/octet-stream",
      "content-disposition": `attachment; filename="${invoice.number}-receipt"`,
      "cache-control": "private, no-store",
    },
  });
}
