// Rebuilds the full initial/final/outturn audit trail from a saved job_outturns row. Pure (given the
// row): GOV, GSV, mass, US BBL, air buoyancy correction and the outturn itself are never persisted —
// only the raw inputs plus TGV/Water Volume/Roof Volume are (see src/db/schema.ts's job_outturns
// comment) — so every reader (inspector page, admin page, the client PDF) recomputes from the same
// retained numbers via this one function, rather than duplicating the arithmetic three times.

import {
  calculateOutturn,
  calculateReading,
  type MovementType,
  type OutturnResult,
  type ReadingInput,
  type ReadingResult,
} from "./outturn";
import type { jobOutturns } from "@/db/schema";

export type OutturnRow = typeof jobOutturns.$inferSelect;

const n = (v: string | null): number | null => (v === null ? null : Number(v));

function toInput(row: OutturnRow, side: "initial" | "final"): ReadingInput {
  return {
    tankId: side === "initial" ? row.initialTankId : row.finalTankId,
    dipMm: n(side === "initial" ? row.initialDipMm : row.finalDipMm),
    waterDipMm: n(side === "initial" ? row.initialWaterDipMm : row.finalWaterDipMm),
    tgvL: n(side === "initial" ? row.initialTgvL : row.finalTgvL),
    waterVolumeL: n(side === "initial" ? row.initialWaterVolumeL : row.finalWaterVolumeL),
    roofVolumeL: n(side === "initial" ? row.initialRoofVolumeL : row.finalRoofVolumeL),
    temperatureC: n(side === "initial" ? row.initialTemperatureC : row.finalTemperatureC),
    densityAt20: n(side === "initial" ? row.initialDensityAt20 : row.finalDensityAt20),
    densityUnit: row.densityUnit as "kg_m3" | "g_cm3",
    vcf: n(side === "initial" ? row.initialVcf : row.finalVcf),
    swPercent: row.isCrudeOil ? n(side === "initial" ? row.initialSwPercent : row.finalSwPercent) : null,
    airBuoyancyOverrideMt: n(side === "initial" ? row.initialAirBuoyancyOverrideMt : row.finalAirBuoyancyOverrideMt),
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

export function buildOutturnTrail(row: OutturnRow, tankCapacityL?: number | null): OutturnTrail {
  const initialInput = toInput(row, "initial");
  const finalInput = toInput(row, "final");
  const initialEval = calculateReading(initialInput, "Initial");
  const finalEval = calculateReading(finalInput, "Final");
  const blockingErrors = [...initialEval.blockingErrors, ...finalEval.blockingErrors];
  const warnings = [...initialEval.warnings, ...finalEval.warnings];

  let outturn: OutturnResult | null = null;
  if (initialEval.result && finalEval.result) {
    const o = calculateOutturn(
      { ...initialInput, result: initialEval.result },
      { ...finalInput, result: finalEval.result },
      row.movementType as MovementType,
      tankCapacityL,
    );
    outturn = o.result;
    warnings.push(...o.warnings);
  }

  return {
    movementType: row.movementType as MovementType,
    isCrudeOil: row.isCrudeOil,
    initial: { input: initialInput, result: initialEval.result },
    final: { input: finalInput, result: finalEval.result },
    outturn,
    blockingErrors,
    warnings,
  };
}
