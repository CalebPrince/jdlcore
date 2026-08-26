import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { requireDb } from "@/db";
import { certificates, clients, inspectors, jobCompletionData, jobs, staff } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { getStaff } from "@/lib/staff-auth";
import { getInspector } from "@/lib/inspector-auth";
import { getReportSettings, type ReportSettings } from "@/lib/settings";

const NAVY = rgb(0.031, 0.094, 0.149);
const GOLD = rgb(0.788, 0.557, 0.071);
const INK = rgb(0.102, 0.153, 0.2);
const MUTED = rgb(0.42, 0.47, 0.52);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await params;
  const certId = Number(rawId);
  if (!Number.isInteger(certId) || certId <= 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const portal = await getPortalClient();
  const staffUser = portal ? null : await getStaff();
  const inspector = portal || staffUser ? null : await getInspector();
  if (!portal && !staffUser && !inspector) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const database = requireDb();
  const rows = await database
    .select({
      certificate: certificates,
      job: jobs,
      client: clients,
      completion: jobCompletionData,
    })
    .from(certificates)
    .innerJoin(jobs, eq(certificates.jobId, jobs.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .leftJoin(jobCompletionData, eq(jobCompletionData.jobId, jobs.id))
    .where(eq(certificates.id, certId))
    .limit(1);

  const row = rows[0];
  if (!row) return new NextResponse("Not found", { status: 404 });
  if (portal && row.job.clientId !== portal.id) return new NextResponse("Not found", { status: 404 });
  if (inspector && row.job.assignedInspectorId !== inspector.id) return new NextResponse("Not found", { status: 404 });

  let inspectorName: string | null = null;
  if (row.job.assignedInspectorId) {
    const inspRows = await database
      .select({ name: inspectors.name })
      .from(inspectors)
      .where(eq(inspectors.id, row.job.assignedInspectorId))
      .limit(1);
    inspectorName = inspRows[0]?.name ?? null;
  }

  let approverName: string | null = null;
  if (row.certificate.issuedByStaffId) {
    const staffRows = await database
      .select({ name: staff.name })
      .from(staff)
      .where(eq(staff.id, row.certificate.issuedByStaffId))
      .limit(1);
    approverName = staffRows[0]?.name ?? null;
  }

  const reportSettings = await getReportSettings();
  const pdf = await buildCoqPdf(row.certificate, row.job, row.client, row.completion, inspectorName, approverName, reportSettings);

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${row.certificate.coqNumber}.pdf"`,
      "cache-control": "no-store",
    },
  });
}

type CertificateRow = typeof certificates.$inferSelect;
type JobRow = typeof jobs.$inferSelect;
type ClientRow = typeof clients.$inferSelect;
type CompletionRow = typeof jobCompletionData.$inferSelect | null;

async function buildCoqPdf(
  certificate: CertificateRow,
  job: JobRow,
  client: ClientRow,
  completion: CompletionRow,
  inspectorName: string | null,
  approverName: string | null,
  reportSettings: ReportSettings,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const M = 56;

  page.drawRectangle({ x: 0, y: 762, width: 595, height: 80, color: NAVY });
  page.drawText("JDL CORE", { x: M, y: 800, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText(reportSettings.headerTagline, {
    x: M,
    y: 784,
    size: 7.5,
    font: regular,
    color: rgb(0.65, 0.72, 0.78),
  });
  page.drawText("CERTIFICATE OF QUANTITY", { x: 330, y: 796, size: 15, font: bold, color: GOLD });

  let y = 716;
  const label = (text: string, x: number) =>
    page.drawText(text.toUpperCase(), { x, y, size: 8, font: bold, color: MUTED });

  label("Client", M);
  label("COQ Number", 380);
  y -= 16;
  page.drawText(client.company || client.name, { x: M, y, size: 12, font: bold, color: INK });
  page.drawText(certificate.coqNumber, { x: 380, y, size: 11, font: bold, color: INK });

  y -= 15;
  page.drawText(client.company ? client.name : client.email, { x: M, y, size: 10, font: regular, color: MUTED });
  page.drawText(`Date of approval: ${formatDate(certificate.issuedAt)}`, { x: 380, y, size: 9, font: regular, color: MUTED });

  y -= 14;
  page.drawText(`Service Reference: ${job.ref}`, { x: M, y, size: 9, font: regular, color: MUTED });
  page.drawText(`Location: ${job.location || "—"}`, { x: 380, y, size: 9, font: regular, color: MUTED });

  y -= 14;
  page.drawText(`Service: ${job.service}`, { x: M, y, size: 9, font: regular, color: MUTED });
  page.drawText(`Product: ${job.product || "—"}`, { x: 380, y, size: 9, font: regular, color: MUTED });

  y -= 14;
  page.drawText(`Inspector: ${inspectorName || "—"}`, { x: M, y, size: 9, font: regular, color: MUTED });
  page.drawText(`Tank/Depot: ${job.tankOrDepot || "—"}`, { x: 380, y, size: 9, font: regular, color: MUTED });

  y -= 14;
  page.drawText(
    `Started: ${completion?.dateTimeStarted ? formatDateTime(completion.dateTimeStarted) : "—"}`,
    { x: M, y, size: 9, font: regular, color: MUTED },
  );
  page.drawText(
    `Completed: ${completion?.dateTimeCompleted ? formatDateTime(completion.dateTimeCompleted) : "—"}`,
    { x: 380, y, size: 9, font: regular, color: MUTED },
  );

  // Results table
  y -= 44;
  page.drawRectangle({ x: M, y: y - 6, width: 595 - M * 2, height: 26, color: rgb(0.949, 0.937, 0.906) });
  page.drawText("MEASUREMENT", { x: M + 12, y: y + 2, size: 8, font: bold, color: NAVY });
  page.drawText("VALUE", { x: 452, y: y + 2, size: 8, font: bold, color: NAVY });

  const results: [string, string | null][] = [
    ["Gross Observed Volume (GOV)", completion?.gov ?? null],
    ["Gross Standard Volume (GSV)", completion?.gsv ?? null],
    ["Metric Tonnes in Air", completion?.metricTonnesAir ?? null],
    ["Metric Tonnes in Vacuum", completion?.metricTonnesVacuum ?? null],
  ];

  for (const [rowLabel, value] of results) {
    y -= 30;
    page.drawText(rowLabel, { x: M + 12, y, size: 10.5, font: regular, color: INK });
    page.drawText(value ?? "—", { x: 452, y, size: 10.5, font: bold, color: INK });
    y -= 16;
    page.drawLine({ start: { x: M + 12, y }, end: { x: 539, y }, thickness: 0.5, color: rgb(0.9, 0.89, 0.86) });
  }

  if (completion?.inspectorComments) {
    y -= 30;
    page.drawText("INSPECTOR COMMENTS", { x: M, y, size: 8, font: bold, color: MUTED });
    y -= 14;
    page.drawText(truncate(completion.inspectorComments, 100), { x: M, y, size: 9, font: regular, color: INK });
  }

  y -= 50;
  page.drawText("OPERATIONS APPROVAL", { x: M, y, size: 8, font: bold, color: MUTED });
  y -= 18;
  page.drawText(approverName || "JDL Core Operations", { x: M, y, size: 13, font: bold, color: NAVY });
  y -= 14;
  page.drawText(`Approved ${formatDate(certificate.issuedAt)}`, { x: M, y, size: 9, font: regular, color: MUTED });

  page.drawText("CERTIFIED", {
    x: 320,
    y: 260,
    size: 44,
    font: bold,
    color: rgb(0.122, 0.478, 0.302),
    opacity: 0.14,
    rotate: degrees(-20),
  });

  if (certificate.remarks) {
    page.drawText(truncate(certificate.remarks, 110), { x: M, y: 96, size: 8.5, font: regular, color: MUTED });
  }
  page.drawText(truncate(reportSettings.certifyingStatement, 110), {
    x: M,
    y: 84,
    size: 8.5,
    font: regular,
    color: MUTED,
  });

  return pdf.save();
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
