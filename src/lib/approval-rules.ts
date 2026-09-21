// Pure figure checks for automatic approval: no database, so they can be tested directly.

/** GSV is GOV corrected to standard temperature, so it stays close to it; far apart means a typo. */
export const GSV_TO_GOV_MIN = 0.9;
export const GSV_TO_GOV_MAX = 1.1;
/** Tonnes in air and in vacuum differ by a fraction of a percent; more than this is an entry error. */
export const AIR_VS_VACUUM_MAX_DIFF = 0.01;

export type Figures = {
  gov: number | null;
  gsv: number | null;
  air: number | null;
  vacuum: number | null;
  started: Date | null;
  finished: Date | null;
};

/** Are all required figures present? */
export function checkRequired(f: Figures): { ok: boolean; detail: string } {
  const missing = [
    f.gov === null && "GOV",
    f.gsv === null && "GSV",
    f.air === null && "tonnes (air)",
    f.vacuum === null && "tonnes (vacuum)",
    !f.started && "start time",
    !f.finished && "completion time",
  ].filter(Boolean);
  return missing.length
    ? { ok: false, detail: `Missing: ${missing.join(", ")}.` }
    : { ok: true, detail: "GOV, GSV, tonnes and times are all present." };
}

/** Do the figures agree with each other? */
export function checkReconcile(f: Figures): { ok: boolean; detail: string } {
  if (f.gov === null || f.gsv === null || f.air === null || f.vacuum === null) {
    return { ok: false, detail: "Cannot compare: figures are missing." };
  }
  const positive = f.gov > 0 && f.gsv > 0 && f.air > 0 && f.vacuum > 0;
  const ratio = f.gov > 0 ? f.gsv / f.gov : 0;
  const airGap = f.vacuum > 0 ? Math.abs(f.vacuum - f.air) / f.vacuum : 1;
  const timesOk = !f.started || !f.finished || f.finished >= f.started;
  const problems = [
    !positive && "a figure is zero or negative",
    positive && (ratio < GSV_TO_GOV_MIN || ratio > GSV_TO_GOV_MAX) && `GSV is ${(ratio * 100).toFixed(1)}% of GOV`,
    positive && airGap > AIR_VS_VACUUM_MAX_DIFF && `air and vacuum tonnes differ by ${(airGap * 100).toFixed(2)}%`,
    !timesOk && "completion time is before the start time",
  ].filter(Boolean);
  return problems.length
    ? { ok: false, detail: `${problems.join("; ")}.` }
    : { ok: true, detail: "GSV/GOV, air/vacuum tonnes and the dates are consistent." };
}
