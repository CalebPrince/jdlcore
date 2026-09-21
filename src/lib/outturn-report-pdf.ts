// Builds the standalone Product Outturn Report PDF: a logo/title/dates/job-number header, one
// column-pair (Initial/Final) per tank in the job's outturn, and a summary (movement type, per-tank
// and grand-total outturn, notes). Kept separate from the route (src/app/api/jobs/[id]/outturn-report/
// pdf/route.ts) so it only depends on pdf-lib and the pure outturn calculators — no auth/DB imports —
// which also makes it renderable with fixture data for visual verification.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { buildOutturnTrail, sumOutturnTotals, type OutturnHeaderRow, type OutturnTankRow } from "./outturn-trail";

const NAVY = rgb(0.031, 0.094, 0.149);
const GOLD = rgb(0.788, 0.557, 0.071);
const INK = rgb(0.102, 0.153, 0.2);
const MUTED = rgb(0.42, 0.47, 0.52);
const PANEL = rgb(0.106, 0.106, 0.106); // the mockup's dark row-label sidebar

// Landscape A4, so several tank columns fit side by side as in the mockup.
const PAGE_W = 842;
const PAGE_H = 595;
const TANKS_PER_PAGE = 4;

export type OutturnReportJob = { ref: string; service: string; location: string | null; product: string | null };
export type OutturnReportClient = { name: string; company: string | null };
export type OutturnReportCompletion = { dateTimeStarted: Date | null; dateTimeCompleted: Date | null } | null;

const fmt = (n: number | null | undefined, d = 3) =>
  n === null || n === undefined ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtStr = (v: string | null, d = 2) => (v === null ? "—" : fmt(Number(v), d));

function formatDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export async function buildOutturnReportPdf(
  job: OutturnReportJob,
  client: OutturnReportClient,
  completion: OutturnReportCompletion,
  header: OutturnHeaderRow,
  tankRows: OutturnTankRow[],
  tankName: Map<number, string>,
  headerTagline: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const M = 40;

  const logoBytes = await readFile(path.join(process.cwd(), "public", "logo-inspection.png"));
  const logo = await pdf.embedPng(logoBytes);
  const logoH = 34;
  const logoW = logoH * (logo.width / logo.height);

  const pages: OutturnTankRow[][] = [];
  for (let i = 0; i < tankRows.length; i += TANKS_PER_PAGE) pages.push(tankRows.slice(i, i + TANKS_PER_PAGE));

  for (const [pageIndex, pageTanks] of pages.entries()) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    page.drawImage(logo, { x: M, y: PAGE_H - 50, width: logoW, height: logoH });
    page.drawText(headerTagline, { x: M, y: PAGE_H - 60, size: 7, font: regular, color: MUTED });

    page.drawText(job.service, { x: 300, y: PAGE_H - 34, size: 14, font: bold, color: NAVY });
    page.drawText(pageIndex === 0 ? "PRODUCT OUTTURN REPORT" : `PRODUCT OUTTURN REPORT (continued)`, {
      x: 300,
      y: PAGE_H - 50,
      size: 8,
      font: regular,
      color: MUTED,
    });

    const rx = PAGE_W - M - 170;
    page.drawText("DATE STARTED", { x: rx, y: PAGE_H - 26, size: 7, font: bold, color: MUTED });
    page.drawText(completion?.dateTimeStarted ? formatDateTime(completion.dateTimeStarted) : "—", { x: rx + 90, y: PAGE_H - 26, size: 8, font: regular, color: INK });
    page.drawText("DATE COMPLETED", { x: rx, y: PAGE_H - 40, size: 7, font: bold, color: MUTED });
    page.drawText(completion?.dateTimeCompleted ? formatDateTime(completion.dateTimeCompleted) : "—", { x: rx + 90, y: PAGE_H - 40, size: 8, font: regular, color: INK });
    page.drawText("JOB NUMBER", { x: rx, y: PAGE_H - 54, size: 7, font: bold, color: MUTED });
    page.drawText(job.ref, { x: rx + 90, y: PAGE_H - 54, size: 8, font: bold, color: INK });

    page.drawLine({ start: { x: M, y: PAGE_H - 70 }, end: { x: PAGE_W - M, y: PAGE_H - 70 }, thickness: 1.5, color: GOLD });
    page.drawText(`${client.company || client.name}  ·  ${job.location || "—"}  ·  ${job.product || "—"}`, {
      x: M,
      y: PAGE_H - 84,
      size: 8.5,
      font: regular,
      color: MUTED,
    });

    drawTankTable(page, bold, regular, M, PAGE_H - 104, pageTanks, header, tankName);

    // The summary only makes sense once, alongside the last page of tanks.
    if (pageIndex === pages.length - 1) {
      drawSummary(page, bold, regular, M, header, tankRows, tankName);
    }
  }

  return pdf.save();
}

const ROW_LABELS: { label: string; key: keyof ReturnType<typeof rowValues>; bold?: boolean }[] = [
  { label: "Dip (mm)", key: "dip" },
  { label: "Water Dip (mm)", key: "waterDip" },
  { label: "Temperature (°C)", key: "temp" },
  { label: "Density @ 20°C", key: "density" },
  { label: "VCF", key: "vcf" },
  { label: "TGV (L)", key: "tgv" },
  { label: "Water Volume (L)", key: "waterVolume" },
  { label: "Roof Volume (L)", key: "roofVolume" },
  { label: "GOV (L)", key: "gov", bold: true },
  { label: "GSV (L)", key: "gsv", bold: true },
  { label: "S&W (%)", key: "sw" },
  { label: "Net Standard Volume (L)", key: "netStd" },
  { label: "US BBL", key: "usBbl" },
  { label: "Mt Vac", key: "mtVac" },
  { label: "Mt Air", key: "mtAir" },
];

function rowValues(tank: OutturnTankRow, side: "initial" | "final", trail: ReturnType<typeof buildOutturnTrail>) {
  const input = side === "initial" ? trail.initial.input : trail.final.input;
  const result = side === "initial" ? trail.initial.result : trail.final.result;
  return {
    dip: fmtStr(side === "initial" ? tank.initialDipMm : tank.finalDipMm, 2),
    waterDip: fmtStr(side === "initial" ? tank.initialWaterDipMm : tank.finalWaterDipMm, 2),
    temp: fmtStr(side === "initial" ? tank.initialTemperatureC : tank.finalTemperatureC, 2),
    density: fmtStr(side === "initial" ? tank.initialDensityAt20 : tank.finalDensityAt20, 4),
    vcf: fmtStr(side === "initial" ? tank.initialVcf : tank.finalVcf, 5),
    tgv: fmt(input.tgvL),
    waterVolume: fmt(input.waterVolumeL),
    roofVolume: fmt(input.roofVolumeL),
    gov: fmt(result?.gov),
    gsv: fmt(result?.gsv),
    sw: fmtStr(side === "initial" ? tank.initialSwPercent : tank.finalSwPercent, 3),
    netStd: fmt(result?.netStandardVolumeL),
    usBbl: fmt(result?.usBbl),
    mtVac: fmt(result?.mtVac),
    mtAir: fmt(result?.mtAir),
  };
}

function drawTankTable(
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  M: number,
  topY: number,
  pageTanks: OutturnTankRow[],
  header: OutturnHeaderRow,
  tankName: Map<number, string>,
) {
  const labelW = 130;
  const availableW = PAGE_W - M * 2 - labelW;
  const colW = availableW / (pageTanks.length || 1);
  const subColW = colW / 2;
  const rowH = 16;
  const skipCrude = !header.isCrudeOil;

  const visibleRows = ROW_LABELS.filter((r) => !skipCrude || (r.key !== "sw" && r.key !== "netStd"));

  let y = topY;
  // Tank name header row
  page.drawRectangle({ x: M, y: y - 18, width: labelW + colW * pageTanks.length, height: 18, color: PANEL });
  pageTanks.forEach((t, i) => {
    const x = M + labelW + i * colW;
    const initialName = tankName.get(t.initialTankId) ?? `Tank #${t.initialTankId}`;
    const finalName = tankName.get(t.finalTankId) ?? `Tank #${t.finalTankId}`;
    const label = initialName === finalName ? initialName : `${initialName} → ${finalName}`;
    page.drawText(label.toUpperCase(), { x: x + 4, y: y - 13, size: 7.5, font: bold, color: rgb(1, 1, 1) });
  });
  y -= 18;

  // Initial/Final sub-header row
  page.drawRectangle({ x: M, y: y - 16, width: labelW + colW * pageTanks.length, height: 16, color: rgb(0.949, 0.937, 0.906) });
  pageTanks.forEach((_, i) => {
    const x = M + labelW + i * colW;
    page.drawText("INITIAL", { x: x + 4, y: y - 11, size: 7, font: bold, color: NAVY });
    page.drawText("FINAL", { x: x + subColW + 4, y: y - 11, size: 7, font: bold, color: NAVY });
    page.drawLine({ start: { x: x + subColW, y: y - 16 }, end: { x: x + subColW, y: y - 16 + 16 }, thickness: 0.5, color: rgb(0.85, 0.83, 0.78) });
  });
  y -= 16;

  const trails = pageTanks.map((t) => buildOutturnTrail(header, t));

  for (const rowDef of visibleRows) {
    y -= rowH;
    const font = rowDef.bold ? bold : regular;
    page.drawText(rowDef.label, { x: M + 4, y: y + 4, size: 8, font, color: INK });
    pageTanks.forEach((t, i) => {
      const trail = trails[i];
      const x = M + labelW + i * colW;
      const initialVals = rowValues(t, "initial", trail);
      const finalVals = rowValues(t, "final", trail);
      page.drawText(String(initialVals[rowDef.key]), { x: x + 4, y: y + 4, size: 8, font, color: INK });
      page.drawText(String(finalVals[rowDef.key]), { x: x + subColW + 4, y: y + 4, size: 8, font, color: INK });
    });
    page.drawLine({ start: { x: M, y }, end: { x: M + labelW + colW * pageTanks.length, y }, thickness: 0.5, color: rgb(0.9, 0.89, 0.86) });
  }

  // Any warnings for these tanks, compactly.
  const warnings = trails.flatMap((t) => t.warnings);
  if (warnings.length > 0) {
    y -= 20;
    page.drawText("FLAGGED FOR REVIEW", { x: M, y, size: 7.5, font: bold, color: rgb(0.63, 0.38, 0.02) });
    for (const w of warnings.slice(0, 4)) {
      y -= 11;
      page.drawText(`• ${w.length > 130 ? `${w.slice(0, 129)}…` : w}`, { x: M, y, size: 7.5, font: regular, color: rgb(0.63, 0.38, 0.02) });
    }
  }
}

function drawSummary(
  page: PDFPage,
  bold: PDFFont,
  regular: PDFFont,
  M: number,
  header: OutturnHeaderRow,
  tankRows: OutturnTankRow[],
  tankName: Map<number, string>,
) {
  const totals = sumOutturnTotals(header, tankRows);
  let y = 96;
  page.drawLine({ start: { x: M, y: y + 14 }, end: { x: PAGE_W - M, y: y + 14 }, thickness: 1, color: GOLD });
  page.drawText("SUMMARY", { x: M, y, size: 9, font: bold, color: NAVY });
  y -= 14;
  const movement = header.movementType === "receipt" ? "Receipt into tank" : "Delivery / issue from tank";
  page.drawText(`Movement: ${movement}`, { x: M, y, size: 8.5, font: regular, color: INK });
  y -= 13;
  page.drawText(
    `Grand total (${tankRows.length} tank${tankRows.length === 1 ? "" : "s"}): GOV ${fmt(totals.govOutturnL)} L · GSV ${fmt(
      totals.volumeOutturnL,
    )} L · US BBL ${fmt(totals.usBblOutturn)} · Mt Vac ${fmt(totals.mtVacOutturn)} · Mt Air ${fmt(totals.mtAirOutturn)}${
      header.isCrudeOil && totals.netOutturnL !== null ? ` · Net ${fmt(totals.netOutturnL)} L` : ""
    }`,
    { x: M, y, size: 8.5, font: bold, color: NAVY },
  );
  if (tankRows.length > 1) {
    y -= 13;
    const perTank = tankRows
      .map((t) => {
        const trail = buildOutturnTrail(header, t);
        const name = tankName.get(t.initialTankId) ?? `Tank #${t.initialTankId}`;
        return `${name}: GSV ${fmt(trail.outturn?.volumeOutturnL)} L`;
      })
      .join("  ·  ");
    page.drawText(perTank.length > 160 ? `${perTank.slice(0, 159)}…` : perTank, { x: M, y, size: 7.5, font: regular, color: MUTED });
  }
  if (totals.incompleteTankCount > 0) {
    y -= 13;
    page.drawText(
      `${totals.incompleteTankCount} tank(s) could not be calculated and are excluded from this total.`,
      { x: M, y, size: 7.5, font: regular, color: rgb(0.7, 0.15, 0.15) },
    );
  }
  if (header.notes) {
    y -= 15;
    page.drawText("NOTES", { x: M, y, size: 7, font: bold, color: MUTED });
    y -= 11;
    const notes = header.notes.length > 180 ? `${header.notes.slice(0, 179)}…` : header.notes;
    page.drawText(notes, { x: M, y, size: 8, font: regular, color: INK });
  }
}
