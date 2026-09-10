import "server-only";
import { runCompletion, AiUnavailableError } from "./gateway";
import type { ModelInput } from "@/lib/stock-sheet";
import { normaliseNumeric } from "@/lib/decimal";

/** Numeric fields the model may return, with the decimal scale each column accepts. */
export const READING_FIELDS = {
  dipHeightMm: 3,
  temperatureC: 2,
  densityAt20: 4,
  vcf: 5,
  gov: 3,
  gsv: 3,
  openingStock: 3,
  closingStock: 3,
  receipts: 3,
  transfers: 3,
  dischargesLoads: 3,
  netWeightAir: 3,
  netWeightVacuum: 3,
  pumpableStock: 3,
} as const;

export type ReadingField = keyof typeof READING_FIELDS;

export type ExtractedRow = {
  tank: string;
  readingDate: string | null;
  statusRemark: string | null;
} & Partial<Record<ReadingField, string>>;

export type ExtractResult = { rows: ExtractedRow[]; notes: string; provider: string };

const MAX_TEXT_CHARS = 40_000;

const SYSTEM_PROMPT = `You extract tank-gauge readings from a petroleum depot's daily stock / "tanks daily situation" sheet for JDL Core Inspection Services.

Return ONLY a JSON object, no prose, no markdown fences:
{"rows": [ { ...one row per tank per reading date... } ], "notes": "short string, may be empty"}

Each row:
- "tank": the tank label exactly as written on the sheet (e.g. "TK 51", "Tank 3", "36\\" P/LINE"). REQUIRED.
- "readingDate": ISO date "YYYY-MM-DD". If the sheet has a single situation date, use it for every row. If you cannot find one, use null.
- "statusRemark": any status/remark against the tank ("FEEDING", "PLANT SUCTION", "FINAL SHIP", "GOOD", ...), else null.
- Optional numeric fields (omit the key entirely if the sheet doesn't give it): dipHeightMm, temperatureC, densityAt20, vcf, gov, gsv, openingStock, closingStock, receipts, transfers, dischargesLoads, netWeightAir, netWeightVacuum, pumpableStock.

Rules:
- Numbers must be plain: no thousands separators, no units, no % signs. "46,103.2" -> "46103.2".
- Never invent or estimate a value. Omit what isn't on the sheet.
- One physical tank = one row. Do not emit total / sub-total / grand-total rows.
- If something is ambiguous (unclear which column is which, an unreadable cell, two candidate dates), say so briefly in "notes".`;

export async function extractStockReadings(input: {
  modelInput: ModelInput;
  tankNames: string[];
  product: string | null;
  defaultDate: string;
}): Promise<ExtractResult> {
  const { modelInput, tankNames, product, defaultDate } = input;

  if (modelInput.text && modelInput.text.length > MAX_TEXT_CHARS) {
    throw new Error(
      "This looks like a multi-day workbook. Upload one day's sheet at a time (or split it out).",
    );
  }

  const context = [
    `Tanks on file for this job (align labels to these where possible): ${tankNames.join(", ") || "(none registered)"}.`,
    product ? `Product: ${product}.` : "",
    `If the sheet has no date, assume ${defaultDate}.`,
    modelInput.text ? `\nSHEET CONTENT (cell references shown as <col><row>):\n${modelInput.text}` : "Extract the readings from the attached file.",
  ]
    .filter(Boolean)
    .join("\n");

  let text: string;
  let provider: string;
  try {
    const res = await runCompletion({
      system: SYSTEM_PROMPT,
      turns: [{ role: "user", content: context }],
      attachment: modelInput.attachment,
      maxTokens: 8000,
      totalTimeoutMs: 60_000,
      temperature: 0,
    });
    text = res.text;
    provider = res.provider;
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      throw new Error(
        "No AI provider is available to read the sheet right now. Enter the readings manually, or ask an administrator to check AI settings.",
      );
    }
    throw err;
  }

  const match = text.match(/\{[\s\S]*\}/);
  let parsed: { rows?: unknown; notes?: unknown };
  try {
    parsed = JSON.parse(match ? match[0] : text);
  } catch {
    throw new Error("The sheet couldn't be read into readings. Try a clearer file, or enter them manually.");
  }

  const rawRows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const rows: ExtractedRow[] = [];
  for (const r of rawRows) {
    if (!r || typeof r !== "object") continue;
    const obj = r as Record<string, unknown>;
    const tank = typeof obj.tank === "string" ? obj.tank.trim() : "";
    if (!tank) continue;
    const row: ExtractedRow = {
      tank,
      readingDate: normaliseDate(obj.readingDate) ?? defaultDate,
      statusRemark: typeof obj.statusRemark === "string" && obj.statusRemark.trim() ? obj.statusRemark.trim().slice(0, 40) : null,
    };
    for (const field of Object.keys(READING_FIELDS) as ReadingField[]) {
      const v = obj[field];
      if (v == null || v === "") continue;
      const n = normaliseNumeric(typeof v === "number" ? v : String(v));
      if (n) row[field] = n;
    }
    rows.push(row);
  }

  const notes = typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 600) : "";
  return { rows, notes, provider };
}

function normaliseDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
