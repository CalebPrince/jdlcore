const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

function load(file) {
  const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: "ES2022" } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
}
const { calculateReading, calculateOutturn, US_BBL_DIVISOR, STANDARD_AIR_DENSITY_KG_M3 } = load("src/lib/outturn.ts");

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log("ok  ", name); };

// A plain, fully-specified reading: TGV 5,010,000 L, no water, no roof, VCF 0.995, density 750 kg/m3.
const baseReading = (overrides = {}) => ({
  tankId: 1,
  dipMm: 8000,
  waterDipMm: 0,
  tgvL: 5_010_000,
  waterVolumeL: 0,
  roofVolumeL: 0,
  temperatureC: 28,
  densityAt20: 750,
  densityUnit: "kg_m3",
  vcf: 0.995,
  swPercent: null,
  airBuoyancyOverrideMt: null,
  ...overrides,
});

t("a complete reading calculates GOV -> GSV -> mass -> US BBL with no errors or warnings", () => {
  const ev = calculateReading(baseReading(), "Initial");
  assert.equal(ev.blockingErrors.length, 0);
  assert.equal(ev.warnings.length, 0);
  assert.ok(ev.result);
  assert.equal(ev.result.gov, 5_010_000);
  assert.equal(ev.result.gsv, 5_010_000 * 0.995);
  const expectedMtVac = (ev.result.gsv * 750) / 1_000_000;
  assert.ok(Math.abs(ev.result.mtVac - expectedMtVac) < 1e-9);
  assert.ok(Math.abs(ev.result.usBbl - ev.result.gsv / US_BBL_DIVISOR) < 1e-9);
  assert.equal(ev.result.netStandardVolumeL, null);
});

t("water and roof volume are subtracted from TGV to get GOV", () => {
  const ev = calculateReading(baseReading({ waterVolumeL: 10_000, roofVolumeL: 5_000 }), "Initial");
  assert.equal(ev.result.gov, 5_010_000 - 10_000 - 5_000);
});

t("a missing TGV blocks the calculation with a field-prefixed message", () => {
  const ev = calculateReading(baseReading({ tgvL: null }), "Initial");
  assert.equal(ev.result, null);
  assert.ok(ev.blockingErrors.some((m) => m.startsWith("Initial: TGV is required")));
});

t("water dip greater than total dip is blocked (measurement validation)", () => {
  const ev = calculateReading(baseReading({ dipMm: 100, waterDipMm: 150 }), "Final");
  assert.ok(ev.blockingErrors.some((m) => m.includes("Water dip cannot exceed")));
});

t("non-positive density, missing VCF, and out-of-range S&W are all blocked", () => {
  assert.ok(calculateReading(baseReading({ densityAt20: 0 }), "Initial").blockingErrors.some((m) => m.includes("Density must be positive")));
  assert.ok(calculateReading(baseReading({ vcf: null }), "Initial").blockingErrors.some((m) => m.includes("VCF is required")));
  assert.ok(calculateReading(baseReading({ swPercent: 150 }), "Initial").blockingErrors.some((m) => m.includes("S&W must be between")));
});

t("a negative calculated GOV is flagged as a warning, not blocked", () => {
  const ev = calculateReading(baseReading({ waterVolumeL: 6_000_000 }), "Initial");
  assert.equal(ev.blockingErrors.length, 0);
  assert.ok(ev.result.gov < 0);
  assert.ok(ev.warnings.some((m) => m.includes("GOV is negative")));
});

t("air buoyancy correction is computed from density by default, using the standard air density", () => {
  const ev = calculateReading(baseReading(), "Initial");
  const densityKgM3 = 750;
  const expected = (ev.result.mtVac * STANDARD_AIR_DENSITY_KG_M3) / densityKgM3;
  assert.ok(Math.abs(ev.result.airBuoyancyCorrectionMt - expected) < 1e-9);
  assert.ok(Math.abs(ev.result.mtAir - (ev.result.mtVac - expected)) < 1e-9);
});

t("an inspector override replaces the computed air buoyancy correction", () => {
  const ev = calculateReading(baseReading({ airBuoyancyOverrideMt: 1.234 }), "Initial");
  assert.equal(ev.result.airBuoyancyCorrectionMt, 1.234);
  assert.equal(ev.result.mtAir, ev.result.mtVac - 1.234);
});

t("density in g/cm3 is converted to kg/m3 before the mass formula", () => {
  const kg = calculateReading(baseReading({ densityAt20: 750, densityUnit: "kg_m3" }), "Initial").result;
  const g = calculateReading(baseReading({ densityAt20: 0.75, densityUnit: "g_cm3" }), "Initial").result;
  assert.ok(Math.abs(kg.mtVac - g.mtVac) < 1e-9);
});

t("crude oil S&W: the spec's own worked example (5,000,000 L, 0.50% S&W -> 4,975,000 L)", () => {
  const ev = calculateReading(baseReading({ tgvL: 5_000_000 / 0.995, vcf: 0.995, swPercent: 0.5 }), "Initial");
  assert.ok(Math.abs(ev.result.gsv - 5_000_000) < 1e-6);
  assert.ok(Math.abs(ev.result.netStandardVolumeL - 4_975_000) < 1e-6);
});

// ---- outturn: initial vs final

function readingWithResult(overrides) {
  const input = baseReading(overrides);
  const { result } = calculateReading(input, "Initial");
  return { ...input, result };
}

t("receipt: outturn is final minus initial", () => {
  const initial = readingWithResult({ dipMm: 8000, tgvL: 5_000_000 });
  const final = readingWithResult({ dipMm: 9000, tgvL: 6_000_000 });
  const { result, warnings } = calculateOutturn(initial, final, "receipt");
  assert.ok(Math.abs(result.volumeOutturnL - (final.result.gsv - initial.result.gsv)) < 1e-9);
  assert.equal(warnings.length, 0);
});

t("delivery: outturn is initial minus final", () => {
  const initial = readingWithResult({ dipMm: 9000, tgvL: 6_000_000 });
  const final = readingWithResult({ dipMm: 8000, tgvL: 5_000_000 });
  const { result, warnings } = calculateOutturn(initial, final, "delivery");
  assert.ok(Math.abs(result.volumeOutturnL - (initial.result.gsv - final.result.gsv)) < 1e-9);
  assert.equal(warnings.length, 0);
});

t("logical validation: final dip lower than initial for a declared receipt is flagged", () => {
  const initial = readingWithResult({ dipMm: 9000, tgvL: 6_000_000 });
  const final = readingWithResult({ dipMm: 8000, tgvL: 5_000_000 });
  const { warnings } = calculateOutturn(initial, final, "receipt");
  assert.ok(warnings.some((w) => w.includes("Final dip is lower than initial dip for a declared receipt")));
});

t("logical validation: final dip higher than initial for a declared delivery is flagged", () => {
  const initial = readingWithResult({ dipMm: 8000, tgvL: 5_000_000 });
  const final = readingWithResult({ dipMm: 9000, tgvL: 6_000_000 });
  const { warnings } = calculateOutturn(initial, final, "delivery");
  assert.ok(warnings.some((w) => w.includes("Final dip is higher than initial dip for a declared delivery")));
});

t("different tanks between initial and final is flagged but not blocked", () => {
  const initial = readingWithResult({ tankId: 1, dipMm: 8000, tgvL: 5_000_000 });
  const final = readingWithResult({ tankId: 2, dipMm: 9000, tgvL: 6_000_000 });
  const { warnings } = calculateOutturn(initial, final, "receipt");
  assert.ok(warnings.some((w) => w.includes("different tanks")));
});

t("an outturn larger than the tank's own capacity is flagged as unexpectedly large", () => {
  const initial = readingWithResult({ dipMm: 8000, tgvL: 5_000_000 });
  const final = readingWithResult({ dipMm: 9000, tgvL: 6_000_000 });
  const { warnings } = calculateOutturn(initial, final, "receipt", 500_000);
  assert.ok(warnings.some((w) => w.includes("unexpectedly large")));
});

t("crude oil: net outturn uses each side's own S&W, never assumed equal", () => {
  const initial = readingWithResult({ dipMm: 8000, tgvL: 5_000_000, swPercent: 0.5 });
  const final = readingWithResult({ dipMm: 9000, tgvL: 6_000_000, swPercent: 0.8 });
  const { result } = calculateOutturn(initial, final, "receipt");
  const expected = final.result.netStandardVolumeL - initial.result.netStandardVolumeL;
  assert.ok(Math.abs(result.netOutturnL - expected) < 1e-6);
});

console.log(`\n${n} tests passed`);
