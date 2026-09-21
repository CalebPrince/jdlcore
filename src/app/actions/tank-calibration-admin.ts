"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { tankCalibrationPoints, tanks } from "@/db/schema";
import { requireStaffRole } from "@/lib/staff-auth";
import { logAudit } from "@/lib/audit";
import { parseDecimal3, parseDecimalN } from "@/lib/decimal";
import type { FormState } from "./submissions";

const ADMIN_ROLES = ["administrator", "superadmin"] as const;

async function loadTank(tankId: number) {
  const rows = await requireDb().select().from(tanks).where(eq(tanks.id, tankId)).limit(1);
  return rows[0] ?? null;
}

/** Add or update a single calibration point (upsert by tankId + dipMm). */
export async function addCalibrationPoint(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };

  const tankId = Number(formData.get("tankId"));
  if (!Number.isInteger(tankId) || tankId <= 0) return { ok: false, message: "Bad request." };
  const tank = await loadTank(tankId);
  if (!tank) return { ok: false, message: "Tank not found." };

  const dip = parseDecimalN(String(formData.get("dipMm") ?? ""), 2);
  if (!dip.ok || dip.value === null) return { ok: false, message: `Dip: ${dip.ok ? "enter a dip in mm." : dip.message}` };
  const volume = parseDecimal3(String(formData.get("volumeLitres") ?? ""));
  if (!volume.ok || volume.value === null) return { ok: false, message: `Volume: ${volume.ok ? "enter the volume in litres." : volume.message}` };
  const roofRaw = String(formData.get("roofCorrectionLitres") ?? "");
  const roof = parseDecimal3(roofRaw);
  if (!roof.ok) return { ok: false, message: `Roof correction: ${roof.message}` };

  const db = requireDb();
  const existing = await db
    .select({ id: tankCalibrationPoints.id })
    .from(tankCalibrationPoints)
    .where(and(eq(tankCalibrationPoints.tankId, tankId), eq(tankCalibrationPoints.dipMm, dip.value)))
    .limit(1);

  const values = { tankId, dipMm: dip.value, volumeLitres: volume.value, roofCorrectionLitres: roof.value };
  if (existing[0]) {
    await db.update(tankCalibrationPoints).set(values).where(eq(tankCalibrationPoints.id, existing[0].id));
  } else {
    await db.insert(tankCalibrationPoints).values(values);
  }

  revalidatePath(`/admin/tanks/${tankId}/calibration`);
  await logAudit({
    actor: current,
    action: "tank.calibration_point_saved",
    targetType: "tank",
    targetId: tankId,
    summary: `Set calibration for tank "${tank.name}" at ${dip.value}mm = ${volume.value}L.`,
  });
  return { ok: true, message: "Calibration point saved." };
}

export async function deleteCalibrationPoint(formData: FormData): Promise<void> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return;
  const id = Number(formData.get("id"));
  const tankId = Number(formData.get("tankId"));
  if (!id || !tankId) return;
  await requireDb().delete(tankCalibrationPoints).where(eq(tankCalibrationPoints.id, id));
  revalidatePath(`/admin/tanks/${tankId}/calibration`);
  await logAudit({
    actor: current,
    action: "tank.calibration_point_deleted",
    targetType: "tank",
    targetId: tankId,
    summary: `Removed a calibration point from tank #${tankId}.`,
  });
}

/* ---------------- Bulk paste import (two-phase: preview draft rows, then commit) ---------------- */

export type CalibrationDraftRow = {
  line: number;
  dipMm: string | null;
  volumeLitres: string | null;
  roofCorrectionLitres: string | null;
  issues: string[];
};

export type CalibrationPreviewState = {
  ok: boolean;
  message: string;
  rows?: CalibrationDraftRow[];
};

/** Parses pasted "dip,volume" or "dip,volume,roofCorrection" lines into a reviewable draft — no DB write. */
export async function previewCalibrationImport(_prev: CalibrationPreviewState, formData: FormData): Promise<CalibrationPreviewState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };

  const text = String(formData.get("pasted") ?? "");
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return { ok: false, message: "Paste at least one row: dip, volume (and optionally roof correction), one per line." };

  const rows: CalibrationDraftRow[] = lines.map((line, i) => {
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    const issues: string[] = [];
    const dip = parseDecimalN(parts[0] ?? "", 2);
    if (!dip.ok || dip.value === null) issues.push(dip.ok ? "Dip is required." : `Dip: ${dip.message}`);
    const volume = parseDecimal3(parts[1] ?? "");
    if (!volume.ok || volume.value === null) issues.push(volume.ok ? "Volume is required." : `Volume: ${volume.message}`);
    let roofCorrectionLitres: string | null = null;
    if (parts[2] !== undefined && parts[2] !== "") {
      const roof = parseDecimal3(parts[2]);
      if (!roof.ok) issues.push(`Roof correction: ${roof.message}`);
      else roofCorrectionLitres = roof.value;
    }
    return { line: i + 1, dipMm: dip.ok ? dip.value : null, volumeLitres: volume.ok ? volume.value : null, roofCorrectionLitres, issues };
  });

  return { ok: true, message: `Parsed ${rows.length} row(s). Review before importing.`, rows };
}

/** Re-validates every row server-side (never trusts client-echoed values) and upserts by tankId + dipMm. */
export async function commitCalibrationImport(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };

  const tankId = Number(formData.get("tankId"));
  if (!Number.isInteger(tankId) || tankId <= 0) return { ok: false, message: "Bad request." };
  const tank = await loadTank(tankId);
  if (!tank) return { ok: false, message: "Tank not found." };

  const rowsJson = String(formData.get("rowsJson") ?? "");
  let incoming: { dipMm: string | null; volumeLitres: string | null; roofCorrectionLitres: string | null }[];
  try {
    incoming = JSON.parse(rowsJson);
    if (!Array.isArray(incoming)) throw new Error();
  } catch {
    return { ok: false, message: "Nothing to import." };
  }

  const prepared: { dipMm: string; volumeLitres: string; roofCorrectionLitres: string | null }[] = [];
  for (const [i, row] of incoming.entries()) {
    const dip = parseDecimalN(row.dipMm ?? "", 2);
    if (!dip.ok || dip.value === null) return { ok: false, message: `Row ${i + 1} — dip: ${dip.ok ? "required." : dip.message}` };
    const volume = parseDecimal3(row.volumeLitres ?? "");
    if (!volume.ok || volume.value === null) return { ok: false, message: `Row ${i + 1} — volume: ${volume.ok ? "required." : volume.message}` };
    let roofCorrectionLitres: string | null = null;
    if (row.roofCorrectionLitres != null && row.roofCorrectionLitres !== "") {
      const roof = parseDecimal3(row.roofCorrectionLitres);
      if (!roof.ok) return { ok: false, message: `Row ${i + 1} — roof correction: ${roof.message}` };
      roofCorrectionLitres = roof.value;
    }
    prepared.push({ dipMm: dip.value, volumeLitres: volume.value, roofCorrectionLitres });
  }
  if (prepared.length === 0) return { ok: false, message: "Nothing to import." };

  const db = requireDb();
  for (const row of prepared) {
    const existing = await db
      .select({ id: tankCalibrationPoints.id })
      .from(tankCalibrationPoints)
      .where(and(eq(tankCalibrationPoints.tankId, tankId), eq(tankCalibrationPoints.dipMm, row.dipMm)))
      .limit(1);
    const values = { tankId, ...row };
    if (existing[0]) {
      await db.update(tankCalibrationPoints).set(values).where(eq(tankCalibrationPoints.id, existing[0].id));
    } else {
      await db.insert(tankCalibrationPoints).values(values);
    }
  }

  revalidatePath(`/admin/tanks/${tankId}/calibration`);
  await logAudit({
    actor: current,
    action: "tank.calibration_imported",
    targetType: "tank",
    targetId: tankId,
    summary: `Imported ${prepared.length} calibration point(s) for tank "${tank.name}".`,
  });
  return { ok: true, message: `Imported ${prepared.length} calibration point(s).` };
}
