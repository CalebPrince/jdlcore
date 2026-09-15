import "server-only";

import { eq, inArray } from "drizzle-orm";
import { requireDb } from "@/db";
import { knowledgeDocumentChunks, knowledgeDocuments } from "@/db/schema";
import { chunkDocument, extractDocumentText } from "@/lib/analytics-knowledge";

/**
 * NPA (National Petroleum Authority, Ghana) publishes its price indicators, reports,
 * acts and notices through a WordPress "FileBird Document Library" block on two pages
 * (npa.gov.gh/key-documents and npa.gov.gh/downloads). That plugin exposes a public
 * JSON API the page itself calls to list files per folder — we call the same API
 * directly instead of scraping rendered HTML. Folder ids below were read out of each
 * page's `.njt-fbdl[data-json]` attribute; they're stable plugin-side folder ids, not
 * something we invented, but NPA could add/rename folders without notice.
 */
type NpaSource = {
  label: string;
  folderId: string;
  orderBy: string;
  orderType: "ASC" | "DESC";
};

const NPA_SOURCES: NpaSource[] = [
  { label: "Daily Reports (Petroleum Price Indicators)", folderId: "J1fgrtUzKKkjODMMqFMYkw==", orderBy: "post_modified", orderType: "DESC" },
  { label: "2024 Reports", folderId: "ii2455LXLQC1unZirIdWLQ==", orderBy: "post_title", orderType: "ASC" },
  { label: "BIDEC Files", folderId: "ZM6lnyOndMMgUKFOKQg59w==", orderBy: "post_modified", orderType: "DESC" },
  { label: "Forms", folderId: "g6BZ1qJkQ2AJTeUZRUIKVQ==", orderBy: "post_modified", orderType: "ASC" },
  { label: "Fees", folderId: "qEHIheFMIKsfHkb+d2Fi6A==", orderBy: "post_modified", orderType: "DESC" },
  { label: "Public Notices", folderId: "B5QAVbahzTPXqThpcEgCsA==", orderBy: "post_modified", orderType: "DESC" },
  { label: "Acts & Manuals", folderId: "kE6D1JM2MpsWFp1j3GlFFA==", orderBy: "post_modified", orderType: "DESC" },
  { label: "OMC", folderId: "QLdOdViXpJpWkAIVCAmx3A==", orderBy: "post_modified", orderType: "DESC" },
  { label: "National", folderId: "HCOQ5cXfvZYJYomUcsjF+w==", orderBy: "post_modified", orderType: "DESC" },
  { label: "Industry Reports", folderId: "h9cwfk/7LIm2Xo/ugEyM/w==", orderBy: "post_modified", orderType: "DESC" },
  { label: "Others", folderId: "i6zlzjxm40zc8ds8v160nw==", orderBy: "post_modified", orderType: "DESC" },
  { label: "Regional", folderId: "P3DMMmngYVGKcStTxyEy9g==", orderBy: "post_modified", orderType: "DESC" },
  { label: "Depot", folderId: "95oRJlMLuLZZN5vckTRvCQ==", orderBy: "post_modified", orderType: "DESC" },
];

const NPA_API = "https://npa.gov.gh/wp-json/filebird/v1/get-attachments";

type NpaFile = { title: string; type: string; size: string; url: string; modified: string };

async function listSourceFiles(source: NpaSource): Promise<NpaFile[]> {
  const files: NpaFile[] = [];
  let page = 1;
  let maxPages = 1;
  do {
    const res = await fetch(NPA_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        pagination: { current: page, limit: 100 },
        search: "",
        orderBy: source.orderBy,
        orderType: source.orderType,
        selectedFolder: [source.folderId],
      }),
      cache: "no-store",
    });
    if (!res.ok) break;
    const data = (await res.json()) as { files?: NpaFile[]; maxNumPages?: number };
    files.push(...(data.files ?? []));
    maxPages = data.maxNumPages ?? 1;
    page += 1;
  } while (page <= maxPages);
  return files;
}

function mimeTypeFor(type: string): string | null {
  if (type === "pdf") return "application/pdf";
  if (type === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (type === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return null; // legacy .doc and anything else: not extractable, skip rather than fail loudly
}

/** NPA's `modified` field is a plain "Aug 11, 2026" string — the file's own real-world date. */
function parseNpaModifiedDate(modified: string): Date | null {
  const parsed = new Date(modified);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type NpaSyncResult = {
  scanned: number;
  added: number;
  skippedExisting: number;
  skippedUnsupported: number;
  failed: number;
  remaining: number;
  durationMs: number;
};

/**
 * Crawls NPA's document folders and ingests anything not already in our knowledge base
 * as a global (all-subscriber) knowledge document. Bounded per call (documents + time)
 * so it's safe to run from a serverless request — call repeatedly (daily cron, or the
 * admin "Sync now" button) to drain a large backlog without hitting a function timeout.
 */
export async function syncNpaKnowledge(options: { maxDocuments?: number; maxMs?: number } = {}): Promise<NpaSyncResult> {
  const maxDocuments = options.maxDocuments ?? 25;
  const maxMs = options.maxMs ?? 20_000;
  const start = Date.now();
  const database = requireDb();

  const discovered: NpaFile[] = [];
  const seen = new Set<string>();
  for (const source of NPA_SOURCES) {
    try {
      for (const file of await listSourceFiles(source)) {
        if (seen.has(file.url)) continue; // a couple of NPA's own tabs point at the same folder
        seen.add(file.url);
        discovered.push(file);
      }
    } catch {
      // one folder failing shouldn't abort the whole sync
    }
  }

  const urls = discovered.map((f) => f.url);
  const existing = urls.length
    ? await database
        .select({ id: knowledgeDocuments.id, url: knowledgeDocuments.url, status: knowledgeDocuments.status })
        .from(knowledgeDocuments)
        .where(inArray(knowledgeDocuments.url, urls))
    : [];
  // "ready" and "unsupported" are terminal — skip forever. A row stuck in "processing" (the
  // function got killed mid-file — download stall, timeout) or "failed" is retried, reusing
  // the same row rather than piling up duplicates for the same URL.
  const doneUrls = new Set(existing.filter((r) => r.status === "ready" || r.status === "unsupported").map((r) => r.url));
  const retryIdByUrl = new Map(existing.filter((r) => !doneUrls.has(r.url)).map((r) => [r.url, r.id]));
  const pending = discovered.filter((f) => !doneUrls.has(f.url));

  let added = 0;
  let skippedUnsupported = 0;
  let failed = 0;
  let processed = 0;

  for (const file of pending) {
    if (processed >= maxDocuments || Date.now() - start > maxMs) break;
    processed += 1;

    const sourceDate = parseNpaModifiedDate(file.modified);
    const retryId = retryIdByUrl.get(file.url);

    const mimeType = mimeTypeFor(file.type);
    if (!mimeType) {
      skippedUnsupported += 1;
      // Persisted as terminal so this file isn't rediscovered and re-skipped on every
      // future pass — it previously had no DB row at all, so it got "skipped" again and
      // again forever, forever inflating this count without ever making real progress.
      if (retryId !== undefined) {
        await database
          .update(knowledgeDocuments)
          .set({ title: file.title, sourceDate, status: "unsupported", error: `Unsupported file type: .${file.type}` })
          .where(eq(knowledgeDocuments.id, retryId));
      } else {
        await database.insert(knowledgeDocuments).values({
          title: file.title,
          scope: "global",
          url: file.url,
          sourceDate,
          status: "unsupported",
          error: `Unsupported file type: .${file.type}`,
        });
      }
      continue;
    }

    let documentId: number;
    if (retryId !== undefined) {
      documentId = retryId;
      await database.delete(knowledgeDocumentChunks).where(eq(knowledgeDocumentChunks.documentId, documentId));
      await database
        .update(knowledgeDocuments)
        .set({ title: file.title, mimeType, sourceDate, status: "processing", error: null })
        .where(eq(knowledgeDocuments.id, documentId));
    } else {
      const inserted = await database
        .insert(knowledgeDocuments)
        .values({ title: file.title, scope: "global", url: file.url, mimeType, sourceDate, status: "processing" })
        .returning({ id: knowledgeDocuments.id });
      documentId = inserted[0].id;
    }

    // NPA's host has thrown failures under back-to-back requests — a short, polite gap
    // between file downloads avoids tripping that rather than racing through the batch.
    if (processed > 1) await new Promise((resolve) => setTimeout(resolve, 300));

    try {
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const buf = await res.arrayBuffer();
      const blob = new File([buf], file.title, { type: mimeType });
      const chunks = chunkDocument(await extractDocumentText(blob));
      if (chunks.length === 0) throw new Error("No readable text was found in this document.");
      await database.insert(knowledgeDocumentChunks).values(
        chunks.map((content, position) => ({ documentId, position, content })),
      );
      await database
        .update(knowledgeDocuments)
        .set({ status: "ready", sizeBytes: buf.byteLength, processedAt: new Date(), error: null })
        .where(eq(knowledgeDocuments.id, documentId));
      added += 1;
    } catch (error) {
      failed += 1;
      const baseMessage = error instanceof Error ? error.message : "Ingestion failed.";
      // Temporary richer diagnostics — remove once the production-only PDF failure is
      // root-caused (it doesn't reproduce locally, so the error text itself is the only
      // window into what's actually happening on the deployed runtime).
      const stack = error instanceof Error && error.stack ? error.stack.split("\n").slice(0, 3).join(" | ") : "";
      const diag = `runtime=${process.env.NEXT_RUNTIME ?? "?"} node=${process.version} domMatrix=${typeof globalThis.DOMMatrix} type=${file.type} stack=${stack}`;
      const message = `${baseMessage} [[${diag}]]`;
      await database.update(knowledgeDocuments).set({ status: "failed", error: message }).where(eq(knowledgeDocuments.id, documentId));
    }
  }

  return {
    scanned: discovered.length,
    added,
    skippedExisting: doneUrls.size,
    skippedUnsupported,
    failed,
    remaining: pending.length - processed,
    durationMs: Date.now() - start,
  };
}
