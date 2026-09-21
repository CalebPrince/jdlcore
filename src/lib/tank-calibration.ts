import "server-only";
import { asc, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { tankCalibrationPoints } from "@/db/schema";

export type CalibrationLookup = {
  tgvL: number;
  /** null when the tank has no roof-correction data at this dip (e.g. no floating roof). */
  roofVolumeL: number | null;
};

const num = (v: string | null): number | null => (v === null ? null : Number(v));

/**
 * Linear interpolation between the two calibration points bracketing `dipMm` (exact match
 * short-circuits). Returns null when the tank has no calibration table yet, or the dip falls
 * outside the calibrated range — the caller should fall back to a manual TGV/roof-volume entry
 * rather than estimate from tank geometry (spec section 4.1).
 */
export async function lookupVolumeForDip(tankId: number, dipMm: number): Promise<CalibrationLookup | null> {
  const rows = await requireDb()
    .select({ dipMm: tankCalibrationPoints.dipMm, volumeLitres: tankCalibrationPoints.volumeLitres, roofCorrectionLitres: tankCalibrationPoints.roofCorrectionLitres })
    .from(tankCalibrationPoints)
    .where(eq(tankCalibrationPoints.tankId, tankId))
    .orderBy(asc(tankCalibrationPoints.dipMm));

  if (rows.length === 0) return null;

  const points = rows.map((r) => ({ dip: Number(r.dipMm), volume: Number(r.volumeLitres), roof: num(r.roofCorrectionLitres) }));
  if (dipMm < points[0].dip || dipMm > points[points.length - 1].dip) return null;

  const exact = points.find((p) => p.dip === dipMm);
  if (exact) return { tgvL: exact.volume, roofVolumeL: exact.roof };

  let lo = points[0];
  let hi = points[points.length - 1];
  for (let i = 0; i < points.length - 1; i++) {
    if (points[i].dip <= dipMm && points[i + 1].dip >= dipMm) {
      lo = points[i];
      hi = points[i + 1];
      break;
    }
  }
  const span = hi.dip - lo.dip;
  const frac = span === 0 ? 0 : (dipMm - lo.dip) / span;
  const tgvL = lo.volume + frac * (hi.volume - lo.volume);
  const roofVolumeL = lo.roof !== null && hi.roof !== null ? lo.roof + frac * (hi.roof - lo.roof) : null;
  return { tgvL, roofVolumeL };
}
