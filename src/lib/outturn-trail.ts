// Rebuilds the full initial/final/outturn audit trail for one tank from a saved job_outturns
// (header: movement type, crude flag, density unit) + job_outturn_tanks (one tank's readings) row
// pair. Pure (given the rows): GOV, GSV, mass, US BBL, air buoyancy correction and the outturn
// itself are never persisted — only the raw inputs plus TGV/Water Volume/Roof Volume are (see
// src/db/schema.ts's job_outturn_tanks comment) — so every reader (inspector page, admin page, the
// client outturn report) recomputes from the same retained numbers via this one function, rather
// than duplicating the arithmetic in each place.

import {
  calculateOutturn,
  calculateReading,
  type MovementType,
  type OutturnResult,
  type ReadingInput,
  type ReadingResult,
} from "./outturn";
import type { jobOutturns, jobOutturnTanks } from "@/db/schema";

export type OutturnHeaderRow = typeof jobOutturns.$inferSelect;
export type OutturnTankRow = typeof jobOutturnTanks.$inferSelect;

const n = (v: string | null): number | null => (v === null ? null : Number(v));

function toInput(header: OutturnHeaderRow, tank: OutturnTankRow, side: "initial" | "final"): ReadingInput {
  return {
    tankId: side === "initial" ? tank.initialTankId : tank.finalTankId,
    dipMm: n(side === "initial" ? tank.initialDipMm : tank.finalDipMm),
    waterDipMm: n(side === "initial" ? tank.initialWaterDipMm : tank.finalWaterDipMm),
    tgvL: n(side === "initial" ? tank.initialTgvL : tank.finalTgvL),
    waterVolumeL: n(side === "initial" ? tank.initialWaterVolumeL : tank.finalWaterVolumeL),
    roofVolumeL: n(side === "initial" ? tank.initialRoofVolumeL : tank.finalRoofVolumeL),
    temperatureC: n(side === "initial" ? tank.initialTemperatureC : tank.finalTemperatureC),
    densityAt20: n(side === "initial" ? tank.initialDensityAt20 : tank.finalDensityAt20),
    densityUnit: header.densityUnit as "kg_m3" | "g_cm3",
    vcf: n(side === "initial" ? tank.initialVcf : tank.finalVcf),
    swPercent: header.isCrudeOil ? n(side === "initial" ? tank.initialSwPercent : tank.finalSwPercent) : null,
    airBuoyancyOverrideMt: n(side === "initial" ? tank.initialAirBuoyancyOverrideMt : tank.finalAirBuoyancyOverrideMt),
  };
}

export type OutturnTrail = {
  movementType: MovementType;
  isCrudeOil: boolean;
  initial: { input: ReadingInput; result: ReadingResult | null };
  final: { input: ReadingInput; result: ReadingResult | null };
  outturn: OutturnResult | null;
  blockingErrors: string[];
  warnings: string[];
};

/** The full trail for one tank within a job's outturn. */
export function buildOutturnTrail(header: OutturnHeaderRow, tank: OutturnTankRow, tankCapacityL?: number | null): OutturnTrail {
  const initialInput = toInput(header, tank, "initial");
  const finalInput = toInput(header, tank, "final");
  const initialEval = calculateReading(initialInput, "Initial");
  const finalEval = calculateReading(finalInput, "Final");
  const blockingErrors = [...initialEval.blockingErrors, ...finalEval.blockingErrors];
  const warnings = [...initialEval.warnings, ...finalEval.warnings];

  let outturn: OutturnResult | null = null;
  if (initialEval.result && finalEval.result) {
    const o = calculateOutturn(
      { ...initialInput, result: initialEval.result },
      { ...finalInput, result: finalEval.result },
      header.movementType as MovementType,
      tankCapacityL,
    );
    outturn = o.result;
    warnings.push(...o.warnings);
  }

  return {
    movementType: header.movementType as MovementType,
    isCrudeOil: header.isCrudeOil,
    initial: { input: initialInput, result: initialEval.result },
    final: { input: finalInput, result: finalEval.result },
    outturn,
    blockingErrors,
    warnings,
  };
}

export type JobOutturnTotals = {
  govOutturnL: number;
  volumeOutturnL: number;
  usBblOutturn: number;
  mtVacOutturn: number;
  mtAirOutturn: number;
  netOutturnL: number | null;
  /** Tanks whose trail couldn't be fully calculated (missing data) — excluded from the totals below. */
  incompleteTankCount: number;
};

/** Sums every tank's outturn into one job-wide total — what actually feeds jobCompletionData. */
export function sumOutturnTotals(header: OutturnHeaderRow, tankRows: OutturnTankRow[]): JobOutturnTotals {
  const totals: JobOutturnTotals = {
    govOutturnL: 0,
    volumeOutturnL: 0,
    usBblOutturn: 0,
    mtVacOutturn: 0,
    mtAirOutturn: 0,
    netOutturnL: header.isCrudeOil ? 0 : null,
    incompleteTankCount: 0,
  };
  for (const tank of tankRows) {
    const trail = buildOutturnTrail(header, tank);
    if (trail.blockingErrors.length > 0 || !trail.outturn) {
      totals.incompleteTankCount += 1;
      continue;
    }
    totals.govOutturnL += trail.outturn.govOutturnL;
    totals.volumeOutturnL += trail.outturn.volumeOutturnL;
    totals.usBblOutturn += trail.outturn.usBblOutturn;
    totals.mtVacOutturn += trail.outturn.mtVacOutturn;
    totals.mtAirOutturn += trail.outturn.mtAirOutturn;
    if (totals.netOutturnL !== null && trail.outturn.netOutturnL !== null) totals.netOutturnL += trail.outturn.netOutturnL;
  }
  return totals;
}
