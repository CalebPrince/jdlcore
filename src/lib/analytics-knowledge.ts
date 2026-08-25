import "server-only";

import { and, eq, or } from "drizzle-orm";
import { requireDb } from "@/db";
import { knowledgeDocumentChunks, knowledgeDocuments } from "@/db/schema";

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

export async function extractDocumentText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  if (TEXT_TYPES.has(file.type) || /\.(txt|md|csv|json)$/i.test(file.name)) {
    return new TextDecoder().decode(bytes);
  }
  throw new Error("Use a PDF, TXT, Markdown, CSV, or JSON file.");
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
  const database = requireDb();
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
    ))
    .limit(1000);

  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  if (terms.length === 0) return [];
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
