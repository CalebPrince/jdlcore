import "server-only";
import type { Attachment } from "@/lib/ai/gateway";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** How the uploaded sheet is handed to the model: sheets/CSV become text, PDF/images ride as an attachment. */
export type ModelInput = { text?: string; attachment?: Attachment; fileDataUrl: string };

const TEXT_TYPES = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function sheetToModelInput(file: File): Promise<ModelInput> {
  if (file.size === 0) throw new Error("The file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 4 MB.");

  const ab = await file.arrayBuffer();
  const bytes = Buffer.from(ab);
  const mimeType = file.type || "application/octet-stream";
  const fileDataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
  const name = file.name.toLowerCase();

  if (mimeType === "application/pdf" || name.endsWith(".pdf")) {
    return { attachment: { mimeType: "application/pdf", base64: bytes.toString("base64") }, fileDataUrl };
  }
  if (mimeType.startsWith("image/")) {
    return { attachment: { mimeType, base64: bytes.toString("base64") }, fileDataUrl };
  }
  if (TEXT_TYPES.has(mimeType) || /\.(csv|txt|tsv|json)$/i.test(name)) {
    return { text: new TextDecoder().decode(bytes), fileDataUrl };
  }
  if (name.endsWith(".xlsx") || mimeType.includes("spreadsheetml")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(ab);
    const lines: string[] = [];
    wb.eachSheet((ws) => {
      lines.push(`Sheet "${ws.name}"`);
      ws.eachRow((row, rowNumber) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const v = cell.text?.trim();
          if (v) cells.push(`${colLetter(colNumber)}${rowNumber}: ${v}`);
        });
        if (cells.length) lines.push(cells.join(" | "));
      });
      lines.push("");
    });
    const text = lines.join("\n").trim();
    if (!text) throw new Error("No readable cells found in the spreadsheet.");
    return { text, fileDataUrl };
  }
  if (name.endsWith(".xls")) {
    throw new Error("Old .xls files aren't supported — open it in Excel and Save As .xlsx.");
  }
  throw new Error("Use an Excel (.xlsx), CSV, PDF, or a photo of the sheet.");
}
