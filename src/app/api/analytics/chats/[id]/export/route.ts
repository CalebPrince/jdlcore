import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { requireDb } from "@/db";
import { analyticsChats, analyticsMessages } from "@/db/schema";
import { getAnalyticsUser } from "@/lib/analytics-auth";

type ExportMessage = { role: string; content: string; sources: unknown; createdAt: Date };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAnalyticsUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Not found", { status: 404 });
  const database = requireDb();
  const chats = await database.select({ id: analyticsChats.id, title: analyticsChats.title, createdAt: analyticsChats.createdAt }).from(analyticsChats).where(and(eq(analyticsChats.id, id), eq(analyticsChats.userId, user.id))).limit(1);
  const chat = chats[0];
  if (!chat) return new NextResponse("Not found", { status: 404 });
  const messages = await database.select({ role: analyticsMessages.role, content: analyticsMessages.content, sources: analyticsMessages.sources, createdAt: analyticsMessages.createdAt }).from(analyticsMessages).where(eq(analyticsMessages.chatId, id)).orderBy(asc(analyticsMessages.createdAt));
  const filename = safeFilename(chat.title);
  const format = new URL(request.url).searchParams.get("format");

  if (format === "txt") {
    return new NextResponse(buildText(chat.title, user.name, messages), {
      headers: { "content-type": "text/plain; charset=utf-8", "content-disposition": `attachment; filename="${filename}.txt"`, "cache-control": "private, no-store" },
    });
  }
  const pdf = await buildPdf(chat.title, user.name, user.company, messages);
  return new NextResponse(Buffer.from(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}.pdf"`, "cache-control": "private, no-store" },
  });
}

function buildText(title: string, userName: string, messages: ExportMessage[]) {
  const lines = ["JDL CORE ANALYTICS", title, `Prepared for ${userName}`, `Exported ${new Date().toISOString()}`, ""];
  for (const message of messages) {
    lines.push(`${message.role === "assistant" ? "JDL CORE ANALYTICS" : userName.toUpperCase()} — ${message.createdAt.toISOString()}`, message.content);
    const sources = sourceTitles(message.sources);
    if (sources.length) lines.push(`Sources: ${sources.join("; ")}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function buildPdf(title: string, userName: string, company: string | null, messages: ExportMessage[]) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = addPage(pdf, regular, bold);
  let y = 735;
  y = drawWrapped(page, safeText(title), 48, y, 17, bold, rgb(0.03, 0.09, 0.15), 500, 22);
  page.drawText(`Prepared for ${safeText(userName)}${company ? ` — ${safeText(company)}` : ""}`, { x: 48, y: y - 4, size: 9, font: regular, color: rgb(0.35, 0.4, 0.46) });
  y -= 32;
  for (const message of messages) {
    const label = message.role === "assistant" ? "JDL CORE ANALYTICS" : userName.toUpperCase();
    const contentLines = wrap(safeText(message.content), regular, 10, 500);
    const sources = sourceTitles(message.sources);
    const required = 30 + contentLines.length * 14 + (sources.length ? 25 : 0);
    if (y - required < 55) { page = addPage(pdf, regular, bold); y = 740; }
    page.drawText(safeText(label), { x: 48, y, size: 8, font: bold, color: message.role === "assistant" ? rgb(0.76, 0.52, 0.05) : rgb(0.03, 0.09, 0.15) });
    y -= 18;
    for (const line of contentLines) { page.drawText(line, { x: 48, y, size: 10, font: regular, color: rgb(0.08, 0.12, 0.17) }); y -= 14; }
    if (sources.length) { y -= 3; y = drawWrapped(page, `Sources: ${safeText(sources.join("; "))}`, 48, y, 8, regular, rgb(0.35, 0.4, 0.46), 500, 11); }
    y -= 18;
  }
  pdf.setTitle(safeText(title));
  pdf.setAuthor("JDL Core Analytics");
  return pdf.save();
}

function addPage(pdf: PDFDocument, regular: PDFFont, bold: PDFFont) {
  const page = pdf.addPage([595, 842]);
  page.drawRectangle({ x: 0, y: 790, width: 595, height: 52, color: rgb(0.03, 0.09, 0.15) });
  page.drawText("JDL CORE ANALYTICS", { x: 48, y: 812, size: 13, font: bold, color: rgb(0.95, 0.75, 0.25) });
  page.drawText("SOURCE-GROUNDED INDUSTRY INTELLIGENCE", { x: 355, y: 813, size: 6, font: regular, color: rgb(1, 1, 1) });
  return page;
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>, width: number, leading: number) {
  for (const line of wrap(text, font, size, width)) { page.drawText(line, { x, y, size, font, color }); y -= leading; }
  return y;
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > width && line) { lines.push(line); line = word; } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}

function sourceTitles(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((source) => source && typeof source === "object" && "title" in source && typeof source.title === "string" ? [source.title] : []);
}

function safeFilename(value: string) { return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "analytics-report"; }
function safeText(value: string) { return value.normalize("NFKD").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E\n]/g, ""); }
