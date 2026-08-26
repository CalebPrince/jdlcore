import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { requireDb } from "@/db";
import { clients, invoices, jobs } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { getStaff } from "@/lib/staff-auth";
import { getInspector } from "@/lib/inspector-auth";

const NAVY = rgb(0.031, 0.094, 0.149);
const GOLD = rgb(0.788, 0.557, 0.071);
const INK = rgb(0.102, 0.153, 0.2);
const MUTED = rgb(0.42, 0.47, 0.52);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const invoiceId = Number(rawId);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const portal = await getPortalClient();
  const staff = portal ? null : await getStaff();
  const inspector = portal || staff ? null : await getInspector();
  if (!portal && !staff && !inspector) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const database = requireDb();
  const rows = await database
    .select({
      invoice: invoices,
      job: jobs,
      client: clients,
    })
    .from(invoices)
    .innerJoin(jobs, eq(invoices.jobId, jobs.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(
      portal
        ? and(eq(invoices.id, invoiceId), eq(jobs.clientId, portal.id))
        : inspector
          ? and(eq(invoices.id, invoiceId), eq(jobs.assignedInspectorId, inspector.id))
          : eq(invoices.id, invoiceId),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return new NextResponse("Not found", { status: 404 });

  const { invoice, job, client } = row;
  const pdf = await buildInvoicePdf(invoice, job, client);

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${invoice.number}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

type InvoiceRow = typeof invoices.$inferSelect;
type JobRow = typeof jobs.$inferSelect;
type ClientRow = typeof clients.$inferSelect;

async function buildInvoicePdf(
  invoice: InvoiceRow,
  job: JobRow,
  client: ClientRow,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const M = 56;

  page.drawRectangle({ x: 0, y: 762, width: 595, height: 80, color: NAVY });
  page.drawText("JDL CORE", { x: M, y: 800, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("INSPECTION & QUANTITY SURVEYING", {
    x: M,
    y: 784,
    size: 7.5,
    font: regular,
    color: rgb(0.65, 0.72, 0.78),
  });
  page.drawText("INVOICE", { x: 448, y: 796, size: 20, font: bold, color: GOLD });

  let y = 716;
  const label = (text: string, x: number) =>
    page.drawText(text.toUpperCase(), { x, y, size: 8, font: bold, color: MUTED });

  label("Billed to", M);
  label("Invoice", 380);
  y -= 16;
  page.drawText(client.company || client.name, { x: M, y, size: 12, font: bold, color: INK });
  page.drawText(invoice.number, { x: 380, y, size: 11, font: bold, color: INK });

  y -= 15;
  if (client.company) {
    page.drawText(client.name, { x: M, y, size: 10, font: regular, color: INK });
  } else {
    page.drawText(client.email, { x: M, y, size: 10, font: regular, color: MUTED });
  }
  page.drawText(`Date: ${formatDate(invoice.issuedAt)}`, { x: 380, y, size: 9, font: regular, color: MUTED });

  if (client.company) {
    y -= 14;
    page.drawText(client.email, { x: M, y, size: 10, font: regular, color: MUTED });
  }
  y -= 14;
  page.drawText(`Job: ${job.ref} — ${job.service}`, { x: 380, y, size: 9, font: regular, color: MUTED });

  if (invoice.dueDate) {
    y -= 14;
    page.drawText(`Due: ${formatDate(invoice.dueDate)}`, { x: 380, y, size: 9, font: regular, color: MUTED });
  }

  // Items table
  y -= 44;
  page.drawRectangle({ x: M, y: y - 6, width: 595 - M * 2, height: 26, color: rgb(0.949, 0.937, 0.906) });
  page.drawText("DESCRIPTION", { x: M + 12, y: y + 2, size: 8, font: bold, color: NAVY });
  page.drawText("AMOUNT", { x: 452, y: y + 2, size: 8, font: bold, color: NAVY });

  y -= 34;
  page.drawText(job.service, { x: M + 12, y, size: 10.5, font: regular, color: INK });
  const amount = (invoice.amountCents / 100).toLocaleString("en-GH", {
    minimumFractionDigits: 2,
  });
  page.drawText(`${invoice.currency} ${amount}`, {
    x: 452,
    y,
    size: 10.5,
    font: regular,
    color: INK,
  });

  y -= 18;
  page.drawLine({
    start: { x: M + 12, y },
    end: { x: 539, y },
    thickness: 0.75,
    color: rgb(0.85, 0.85, 0.82),
  });
  y -= 24;
  page.drawText("TOTAL DUE", { x: 356, y, size: 10, font: bold, color: NAVY });
  page.drawText(`${invoice.currency} ${amount}`, {
    x: 452,
    y,
    size: 13,
    font: bold,
    color: NAVY,
  });

  if (invoice.status === "paid") {
    y -= 46;
    page.drawText("PAID IN FULL", {
      x: M + 12,
      y,
      size: 26,
      font: bold,
      color: rgb(0.122, 0.478, 0.302),
      opacity: 0.55,
      rotate: degrees(-8),
    });
  }

  page.drawText("Payment details are provided on request. Quote this invoice number as reference.", {
    x: M,
    y: 96,
    size: 8.5,
    font: regular,
    color: MUTED,
  });
  page.drawText("Thank you for working with JDL Core.", {
    x: M,
    y: 84,
    size: 8.5,
    font: regular,
    color: MUTED,
  });

  return pdf.save();
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
