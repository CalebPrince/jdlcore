// Pure product-outturn calculation: no database, so it can be tested directly. Mirrors the shape of
// src/lib/approval-rules.ts. TGV/Water Volume/Roof Volume arrive already resolved (from the tank's
// calibration table, or a manual override) — this module only does the downstream arithmetic and the
// spec's own validation split: "Measurement validation" -> blockingErrors (can't save), "Logical
// validation" -> warnings (can save, but flagged), exactly as laid out in the spec's section 16.

export type MovementType = "receipt" | "delivery";
export type DensityUnit = "kg_m3" | "g_cm3";

/** Litres of GSV per US barrel (spec section 7). */
export const US_BBL_DIVISOR = 158.9872949;

/**
 * Standard reference air density used for the buoyancy correction (Mt Vac -> Mt Air), per the
 * classic ASTM-IP-API petroleum measurement convention (API MPMS Chapter 11.1). Not an arbitrary
 * fixed percentage: it's applied against the product's own measured density, so the correction
 * scales with the actual product. Revise here if the company's own referenced standard differs.
 */
export const STANDARD_AIR_DENSITY_KG_M3 = 1.1;

/** Sanity bounds used for blocking (not business) validation — catch obvious entry errors. */
const TEMPERATURE_MIN_C = -20;
const TEMPERATURE_MAX_C = 100;
const VCF_MIN = 0.5;
const VCF_MAX = 1.5;

export type ReadingInput = {
  tankId: number | null;
  dipMm: number | null;
  waterDipMm: number | null;
  /** Resolved from the tank's calibration table (or a manual override) before calling this. */
  tgvL: number | null;
  waterVolumeL: number | null;
  /** 0 for a tank with no floating roof. */
  roofVolumeL: number | null;
  temperatureC: number | null;
  densityAt20: number | null;
  densityUnit: DensityUnit;
  vcf: number | null;
  /** Percent, 0-100. Only meaningful when the movement is flagged crude oil. */
  swPercent: number | null;
  /** Only set when the inspector overrides the computed air buoyancy correction. */
  airBuoyancyOverrideMt: number | null;
};

export type ReadingResult = {
  gov: number;
  gsv: number;
  mtVac: number;
  airBuoyancyCorrectionMt: number;
  mtAir: number;
  usBbl: number;
  netStandardVolumeL: number | null;
};

export type ReadingEvaluation = {
  result: ReadingResult | null;
  blockingErrors: string[];
  warnings: string[];
};

/** GOV -> GSV -> mass -> US BBL (-> Net Standard Volume, for crude) for one reading (spec sections 4-10). */
export function calculateReading(input: ReadingInput, label: "Initial" | "Final"): ReadingEvaluation {
  const blockingErrors: string[] = [];
  const warnings: string[] = [];
  const err = (msg: string) => blockingErrors.push(`${label}: ${msg}`);
  const warn = (msg: string) => warnings.push(`${label}: ${msg}`);

  // ---- Measurement validation (spec section 16, first list) — blocking.
  if (input.tgvL === null) err("TGV is required (enter it directly, or calibrate the tank).");
  if (input.dipMm !== null && input.waterDipMm !== null && input.waterDipMm > input.dipMm) {
    err("Water dip cannot exceed the total product dip.");
  }
  if (input.temperatureC === null) err("Temperature is required.");
  else if (input.temperatureC < TEMPERATURE_MIN_C || input.temperatureC > TEMPERATURE_MAX_C) {
    err(`Temperature ${input.temperatureC}°C is outside the plausible range (${TEMPERATURE_MIN_C} to ${TEMPERATURE_MAX_C}°C).`);
  }
  if (input.densityAt20 === null) err("Density is required.");
  else if (input.densityAt20 <= 0) err("Density must be positive.");
  if (input.vcf === null) err("VCF is required.");
  else if (input.vcf < VCF_MIN || input.vcf > VCF_MAX) {
    err(`VCF ${input.vcf} is outside the plausible range (${VCF_MIN} to ${VCF_MAX}).`);
  }
  if (input.swPercent !== null && (input.swPercent < 0 || input.swPercent > 100)) {
    err("S&W must be between 0% and 100%.");
  }

  if (blockingErrors.length > 0) return { result: null, blockingErrors, warnings };

  const tgvL = input.tgvL as number;
  const waterVolumeL = input.waterVolumeL ?? 0;
  const roofVolumeL = input.roofVolumeL ?? 0;
  const densityAt20 = input.densityAt20 as number;
  const vcf = input.vcf as number;

  // ---- Logical validation (spec section 16, second list) — warn, don't block.
  if (waterVolumeL > tgvL) warn("Water volume is greater than TGV.");

  const gov = tgvL - waterVolumeL - roofVolumeL;
  if (gov < 0) warn("Calculated GOV is negative.");

  const gsv = gov * vcf;
  if (gsv < 0) warn("Calculated GSV is negative.");

  // Density unit must be identified before the mass formula is applied (spec section 8).
  const densityKgM3 = input.densityUnit === "g_cm3" ? densityAt20 * 1000 : densityAt20;
  const mtVac = (gsv * densityKgM3) / 1_000_000; // GSV(L) * density(kg/m3) / 1,000,000 = tonnes

  const airBuoyancyCorrectionMt =
    input.airBuoyancyOverrideMt ?? (mtVac * STANDARD_AIR_DENSITY_KG_M3) / densityKgM3;
  const mtAir = mtVac - airBuoyancyCorrectionMt;

  const usBbl = gsv / US_BBL_DIVISOR;

  let netStandardVolumeL: number | null = null;
  if (input.swPercent !== null) {
    netStandardVolumeL = gsv * (1 - input.swPercent / 100);
    if (netStandardVolumeL < 0) warn("Calculated Net Standard Volume is negative.");
  }

  return {
    result: { gov, gsv, mtVac, airBuoyancyCorrectionMt, mtAir, usBbl, netStandardVolumeL },
    blockingErrors,
    warnings,
  };
}

export type OutturnResult = {
  volumeOutturnL: number;
  govOutturnL: number;
  usBblOutturn: number;
  mtVacOutturn: number;
  mtAirOutturn: number;
  netOutturnL: number | null;
};

/** Final-vs-initial difference, signed by movement direction (spec sections 12-13). */
export function calculateOutturn(
  initial: ReadingInput & { result: ReadingResult },
  final: ReadingInput & { result: ReadingResult },
  movementType: MovementType,
  tankCapacityL?: number | null,
): { result: OutturnResult; warnings: string[] } {
  const warnings: string[] = [];
  const sign = movementType === "receipt" ? 1 : -1;
  const diff = (finalV: number, initialV: number) => sign * (finalV - initialV);

  const volumeOutturnL = diff(final.result.gsv, initial.result.gsv);
  const govOutturnL = diff(final.result.gov, initial.result.gov);
  const usBblOutturn = diff(final.result.usBbl, initial.result.usBbl);
  const mtVacOutturn = diff(final.result.mtVac, initial.result.mtVac);
  const mtAirOutturn = diff(final.result.mtAir, initial.result.mtAir);
  const netOutturnL =
    initial.result.netStandardVolumeL !== null && final.result.netStandardVolumeL !== null
      ? diff(final.result.netStandardVolumeL, initial.result.netStandardVolumeL)
      : null;

  if (initial.dipMm !== null && final.dipMm !== null) {
    if (movementType === "receipt" && final.dipMm < initial.dipMm) {
      warnings.push("Final dip is lower than initial dip for a declared receipt.");
    }
    if (movementType === "delivery" && final.dipMm > initial.dipMm) {
      warnings.push("Final dip is higher than initial dip for a declared delivery.");
    }
  }
  if (volumeOutturnL < 0) warnings.push("Calculated outturn is negative — check the readings and movement type.");
  if (initial.tankId !== null && final.tankId !== null && initial.tankId !== final.tankId) {
    warnings.push("Initial and final readings use different tanks.");
  }
  if (tankCapacityL && Math.abs(volumeOutturnL) > tankCapacityL) {
    warnings.push("Outturn is larger than the tank's own capacity — unexpectedly large.");
  }

  return { result: { volumeOutturnL, govOutturnL, usBblOutturn, mtVacOutturn, mtAirOutturn, netOutturnL }, warnings };
}
