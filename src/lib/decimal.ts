export type DecimalParse =
  | { ok: true; value: string | null }
  | { ok: false; message: string };

/** Normalises loose input (commas, spaces, unicode minus) before validation. */
export function normaliseNumeric(raw: string | number | null | undefined): string {
  if (raw == null) return "";
  return String(raw).trim().replace(/,/g, "").replace(/−/g, "-").replace(/\s+/g, "");
}

/** A non-negative number with up to 3 decimal places (volumes, weights). Blank → null. */
export function parseDecimal3(raw: string | number | undefined | null): DecimalParse {
  const s = normaliseNumeric(raw);
  if (s === "") return { ok: true, value: null };
  if (!/^\d+(\.\d{1,3})?$/.test(s)) {
    return { ok: false, message: "Enter a number with up to 3 decimal places." };
  }
  return { ok: true, value: s };
}

/** A number (may be negative) with up to `scale` decimal places (temperature 2, density 4, VCF 5, …). Blank → null. */
export function parseDecimalN(raw: string | number | undefined | null, scale: number): DecimalParse {
  const s = normaliseNumeric(raw);
  if (s === "") return { ok: true, value: null };
  if (!new RegExp(`^-?\\d+(\\.\\d{1,${scale}})?$`).test(s)) {
    return { ok: false, message: `Enter a number with up to ${scale} decimal places.` };
  }
  return { ok: true, value: s };
}
