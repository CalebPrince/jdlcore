import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { requireDb } from "@/db";
import { certificates, clients, inspectors, jobCompletionData, jobOutturns, jobs, staff, tanks } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { getStaff } from "@/lib/staff-auth";
import { getInspector } from "@/lib/inspector-auth";
import { getReportSettings, type ReportSettings } from "@/lib/settings";
import { buildOutturnTrail, type OutturnTrail } from "@/lib/outturn-trail";

const NAVY = rgb(0.031, 0.094, 0.149);
const GOLD = rgb(0.788, 0.557, 0.071);
const INK = rgb(0.102, 0.153, 0.2);
const MUTED = rgb(0.42, 0.47, 0.52);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const preview = new URL(req.url).searchParams.get("preview") === "1";
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

  const outturnRows = await database.select().from(jobOutturns).where(eq(jobOutturns.jobId, row.job.id)).limit(1);
  const outturnRow = outturnRows[0];
  let outturnTrail: OutturnTrail | null = null;
  let initialTankName: string | null = null;
  let finalTankName: string | null = null;
  if (outturnRow) {
    outturnTrail = buildOutturnTrail(outturnRow);
    const tankIds = [...new Set([outturnRow.initialTankId, outturnRow.finalTankId])];
    const tankRows = await database.select({ id: tanks.id, name: tanks.name }).from(tanks).where(inArray(tanks.id, tankIds));
    const tankName = new Map(tankRows.map((t) => [t.id, t.name]));
    initialTankName = tankName.get(outturnRow.initialTankId) ?? null;
    finalTankName = tankName.get(outturnRow.finalTankId) ?? null;
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
  const pdf = await buildCoqPdf(
    row.certificate,
    row.job,
    row.client,
    row.completion,
    inspectorName,
    approverName,
    reportSettings,
    outturnTrail,
    initialTankName,
    finalTankName,
  );

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${preview ? "inline" : "attachment"}; filename="${row.certificate.coqNumber}.pdf"`,
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
  outturnTrail: OutturnTrail | null,
  initialTankName: string | null,
  finalTankName: string | null,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const M = 56;

  const logoBytes = await readFile(path.join(process.cwd(), "public", "logo-inspection.png"));
  const logo = await pdf.embedPng(logoBytes);
  const logoH = 40;
  const logoW = logoH * (logo.width / logo.height);
  page.drawImage(logo, { x: M, y: 780, width: logoW, height: logoH });
  page.drawText(reportSettings.headerTagline, {
    x: M + logoW + 16,
    y: 798,
    size: 7.5,
    font: regular,
    color: MUTED,
  });
  page.drawText("CERTIFICATE OF QUANTITY", { x: 330, y: 796, size: 15, font: bold, color: NAVY });
  page.drawLine({ start: { x: 0, y: 758 }, end: { x: 595, y: 758 }, thickness: 2, color: GOLD });

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

  if (outturnTrail) {
    y -= 14;
    const movement =
      outturnTrail.movementType === "receipt"
        ? `Receipt into ${finalTankName ?? "tank"}`
        : `Delivery / issue from ${initialTankName ?? "tank"}`;
    page.drawText(`Movement: ${movement}`, { x: M, y, size: 9, font: regular, color: MUTED });
    if (initialTankName && finalTankName && initialTankName !== finalTankName) {
      page.drawText(`Tanks: ${initialTankName} → ${finalTankName}`, { x: 380, y, size: 9, font: regular, color: MUTED });
    }
  }

  // Results table — the certificate's headline figures. Once a Product Outturn has been saved for
  // this job, these are the outturn quantities (the amount moved), not a single tank reading.
  y -= 44;
  page.drawRectangle({ x: M, y: y - 6, width: 595 - M * 2, height: 26, color: rgb(0.949, 0.937, 0.906) });
  page.drawText("MEASUREMENT", { x: M + 12, y: y + 2, size: 8, font: bold, color: NAVY });
  page.drawText("VALUE", { x: 452, y: y + 2, size: 8, font: bold, color: NAVY });

  const resultLabel = outturnTrail ? "Outturn" : "";
  const results: [string, string | null][] = [
    [`Gross Observed Volume (GOV)${resultLabel && ` ${resultLabel}`}`, completion?.gov ?? null],
    [`Gross Standard Volume (GSV)${resultLabel && ` ${resultLabel}`}`, completion?.gsv ?? null],
    [`Metric Tonnes in Air${resultLabel && ` ${resultLabel}`}`, completion?.metricTonnesAir ?? null],
    [`Metric Tonnes in Vacuum${resultLabel && ` ${resultLabel}`}`, completion?.metricTonnesVacuum ?? null],
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

  if (outturnTrail) drawOutturnTrailPage(pdf, outturnTrail, bold, regular, M);

  return pdf.save();
}

/**
 * Second page: the full initial/final/outturn calculation trail (spec section 14/15's "AI shall not
 * provide only the final outturn" requirement, made visible on the certificate itself).
 */
function drawOutturnTrailPage(
  pdf: PDFDocument,
  trail: OutturnTrail,
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  regular: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  M: number,
) {
  const page = pdf.addPage([595, 842]);
  let y = 780;
  page.drawText("PRODUCT OUTTURN — CALCULATION TRAIL", { x: M, y, size: 13, font: bold, color: NAVY });
  page.drawLine({ start: { x: 0, y: y - 14 }, end: { x: 595, y: y - 14 }, thickness: 2, color: GOLD });
  y -= 40;

  const { initial, final, outturn } = trail;
  const fmt = (n: number | null | undefined, d = 3) => (n === null || n === undefined ? "—" : n.toFixed(d));

  type Row = { label: string; initial: string; final: string; outturn?: string };
  const rows: Row[] = [
    { label: "Dip (mm)", initial: fmt(initial.input.dipMm, 2), final: fmt(final.input.dipMm, 2) },
    { label: "Water dip (mm)", initial: fmt(initial.input.waterDipMm, 2), final: fmt(final.input.waterDipMm, 2) },
    { label: "TGV (L)", initial: fmt(initial.input.tgvL), final: fmt(final.input.tgvL) },
    { label: "Water volume (L)", initial: fmt(initial.input.waterVolumeL), final: fmt(final.input.waterVolumeL) },
    { label: "Roof volume (L)", initial: fmt(initial.input.roofVolumeL), final: fmt(final.input.roofVolumeL) },
    { label: "GOV (L)", initial: fmt(initial.result?.gov), final: fmt(final.result?.gov), outturn: fmt(outturn?.govOutturnL) },
    { label: "Temperature (°C)", initial: fmt(initial.input.temperatureC, 2), final: fmt(final.input.temperatureC, 2) },
    { label: "Density @ 20°C", initial: fmt(initial.input.densityAt20, 4), final: fmt(final.input.densityAt20, 4) },
    { label: "VCF", initial: fmt(initial.input.vcf, 5), final: fmt(final.input.vcf, 5) },
    { label: "GSV (L)", initial: fmt(initial.result?.gsv), final: fmt(final.result?.gsv), outturn: fmt(outturn?.volumeOutturnL) },
    ...(trail.isCrudeOil
      ? ([
          { label: "S&W (%)", initial: fmt(initial.input.swPercent, 3), final: fmt(final.input.swPercent, 3) },
          {
            label: "Net Standard Volume (L)",
            initial: fmt(initial.result?.netStandardVolumeL),
            final: fmt(final.result?.netStandardVolumeL),
            outturn: fmt(outturn?.netOutturnL),
          },
        ] satisfies Row[])
      : []),
    { label: "US BBL", initial: fmt(initial.result?.usBbl), final: fmt(final.result?.usBbl), outturn: fmt(outturn?.usBblOutturn) },
    { label: "Air buoyancy correction (Mt)", initial: fmt(initial.result?.airBuoyancyCorrectionMt), final: fmt(final.result?.airBuoyancyCorrectionMt) },
    { label: "Metric Tonnes Vacuum", initial: fmt(initial.result?.mtVac), final: fmt(final.result?.mtVac), outturn: fmt(outturn?.mtVacOutturn) },
    { label: "Metric Tonnes Air", initial: fmt(initial.result?.mtAir), final: fmt(final.result?.mtAir), outturn: fmt(outturn?.mtAirOutturn) },
  ];

  const colLabel = M, colInitial = 280, colFinal = 380, colOutturn = 480;
  page.drawRectangle({ x: M, y: y - 6, width: 595 - M * 2, height: 22, color: rgb(0.949, 0.937, 0.906) });
  page.drawText("PARAMETER", { x: colLabel + 6, y: y + 1, size: 7.5, font: bold, color: NAVY });
  page.drawText("INITIAL", { x: colInitial, y: y + 1, size: 7.5, font: bold, color: NAVY });
  page.drawText("FINAL", { x: colFinal, y: y + 1, size: 7.5, font: bold, color: NAVY });
  page.drawText("OUTTURN", { x: colOutturn, y: y + 1, size: 7.5, font: bold, color: NAVY });

  for (const r of rows) {
    y -= 24;
    page.drawText(r.label, { x: colLabel + 6, y, size: 9, font: regular, color: INK });
    page.drawText(r.initial, { x: colInitial, y, size: 9, font: regular, color: INK });
    page.drawText(r.final, { x: colFinal, y, size: 9, font: regular, color: INK });
    page.drawText(r.outturn ?? "—", { x: colOutturn, y, size: 9, font: bold, color: INK });
    page.drawLine({ start: { x: M, y: y - 8 }, end: { x: 539, y: y - 8 }, thickness: 0.5, color: rgb(0.9, 0.89, 0.86) });
  }

  if (trail.warnings.length > 0) {
    y -= 34;
    page.drawText("FLAGGED FOR REVIEW", { x: M, y, size: 8, font: bold, color: rgb(0.63, 0.38, 0.02) });
    for (const w of trail.warnings.slice(0, 6)) {
      y -= 13;
      page.drawText(`• ${truncate(w, 95)}`, { x: M, y, size: 8, font: regular, color: rgb(0.63, 0.38, 0.02) });
    }
  }
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
