import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { invoices, jobs } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { getStaff } from "@/lib/staff-auth";
import { decodeDataUrl, fileResponse, resolveDownload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
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
  const bytes = decodeDataUrl(invoice.receiptFileData!);
  const resolved = resolveDownload({
    bytes,
    mimeType: invoice.receiptMimeType,
    fileName: invoice.receiptFileName,
    fallbackName: `${invoice.number}-receipt`,
  });
  return fileResponse(req, bytes, resolved);
}
