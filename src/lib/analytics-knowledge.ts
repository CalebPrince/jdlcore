import "server-only";

import { and, eq, or, sql } from "drizzle-orm";
import type { Cell } from "exceljs";
import { requireDb } from "@/db";
import { knowledgeDocumentChunks, knowledgeDocuments } from "@/db/schema";
import { DOMMatrixPolyfill } from "@/lib/dommatrix-polyfill";

export type KnowledgeSource = {
  docId: number;
  title: string;
  quote: string;
};

const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

const XLSX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

const DOCX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * exceljs's own `cell.text` getter can throw on certain merged-cell layouts (a "slave"
 * cell in a merge whose master resolves to a null value crashes inside exceljs's own
 * MergeValue.toString) — seen on real NPA spreadsheets with extensive merged headers.
 * Fall back to a manual, defensive read rather than losing the whole document to one cell.
 */
function safeCellText(cell: Cell): string | undefined {
  try {
    return cell.text;
  } catch {
    try {
      const v = cell.value;
      if (v === null || v === undefined) return undefined;
      if (v instanceof Date) return v.toISOString();
      if (typeof v === "object") {
        if ("result" in v && v.result !== null && v.result !== undefined) return String(v.result);
        if ("text" in v && v.text !== null && v.text !== undefined) return String(v.text);
        return undefined;
      }
      return String(v);
    } catch {
      return undefined;
    }
  }
}

export async function extractDocumentText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    // pdf-parse (via pdfjs-dist) reaches for the browser's DOMMatrix global for some PDFs
    // (embedded fonts/transforms) — absent in a plain Node server runtime, throwing
    // "DOMMatrix is not defined". Assigned unconditionally (not just when missing) so it
    // wins over anything pdf-parse's own internal, possibly-incomplete self-polyfill did.
    globalThis.DOMMatrix = DOMMatrixPolyfill as unknown as typeof globalThis.DOMMatrix;
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  if (/\.xls$/i.test(file.name)) {
    throw new Error("Old .xls files aren't supported — open it in Excel and Save As .xlsx.");
  }
  if (/\.doc$/i.test(file.name)) {
    throw new Error("Old .doc files aren't supported — open it in Word and Save As .docx.");
  }
  if (DOCX_TYPES.has(file.type) || /\.docx$/i.test(file.name)) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
    return value;
  }
  if (XLSX_TYPES.has(file.type) || /\.xlsx$/i.test(file.name)) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    const lines: string[] = [];
    workbook.eachSheet((sheet) => {
      lines.push(`Sheet "${sheet.name}"`);
      sheet.eachRow((row, rowNumber) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const v = safeCellText(cell)?.trim();
          if (v) cells.push(`${colLetter(colNumber)}${rowNumber}: ${v}`);
        });
        if (cells.length) lines.push(cells.join(" | "));
      });
      lines.push("");
    });
    return lines.join("\n").trim();
  }
  if (TEXT_TYPES.has(file.type) || /\.(txt|md|csv|json)$/i.test(file.name)) {
    return new TextDecoder().decode(bytes);
  }
  throw new Error("Use a PDF, TXT, Markdown, CSV, XLSX, DOCX, or JSON file.");
}

export function chunkDocument(text: string, maxLength = 1400): string[] {
  const cleaned = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];
  const paragraphs = cleaned.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const parts = paragraph.length > maxLength
      ? paragraph.match(new RegExp(`.{1,${maxLength}}(?:\\s|$)`, "g")) ?? [paragraph]
      : [paragraph];
    for (const part of parts) {
      if (current && current.length + part.length + 2 > maxLength) {
        chunks.push(current.trim());
        current = "";
      }
      current += `${current ? "\n\n" : ""}${part.trim()}`;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.slice(0, 500);
}

export async function retrieveKnowledge(query: string, clientId: number | null, limit = 5): Promise<KnowledgeSource[]> {
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])].slice(0, 12);
  if (terms.length === 0) return [];

  const database = requireDb();
  // Filter to candidate rows in SQL (indexed-scan-able, scales with corpus size) instead of
  // pulling an arbitrary, unordered slice of the whole knowledge base into memory — the old
  // `.limit(1000)` with no ORDER BY silently dropped content once the corpus grew past that.
  const termFilter = sql.join(
    terms.map((term) => sql`${knowledgeDocumentChunks.content} ILIKE ${`%${term}%`}`),
    sql` OR `,
  );
  const rows = await database
    .select({
      docId: knowledgeDocuments.id,
      title: knowledgeDocuments.title,
      content: knowledgeDocumentChunks.content,
    })
    .from(knowledgeDocumentChunks)
    .innerJoin(knowledgeDocuments, eq(knowledgeDocumentChunks.documentId, knowledgeDocuments.id))
    .where(and(
      eq(knowledgeDocuments.status, "ready"),
      clientId
        ? or(eq(knowledgeDocuments.scope, "global"), and(eq(knowledgeDocuments.scope, "client"), eq(knowledgeDocuments.clientId, clientId)))
        : eq(knowledgeDocuments.scope, "global"),
      sql`(${termFilter})`,
    ))
    .limit(2000);

  return rows
    .map((row) => {
      const haystack = row.content.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { ...row, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ docId, title, content }) => ({ docId, title, quote: content }));
}
