import "server-only";
import { NextResponse } from "next/server";

/**
 * Shared handling for files people upload (job documents, payment receipts, chat attachments).
 * Files are kept as base64 data URLs in the database. The original file name and a reliable type
 * are stored with them so a download comes back as the same file that was sent, with its proper
 * extension. Browsers often report no type at all for Office files, and a file served without an
 * extension or as a generic type opens as plain text, which is what this guards against.
 */

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  webm: "audio/webm",
};

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/csv": "csv",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "video/webm": "webm",
};

const GENERIC_MIMES = new Set(["", "application/octet-stream", "binary/octet-stream", "application/zip", "application/x-zip-compressed"]);

/** What the job chat accepts: documents, pictures and audio. Nothing a browser would run. */
export const CHAT_ATTACHMENT_EXTS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt",
  "png", "jpg", "jpeg", "webp",
  "mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "webm",
];

export function extOf(name: string | null | undefined): string {
  const match = /\.([a-z0-9]{1,8})$/i.exec((name ?? "").trim());
  return match ? match[1].toLowerCase() : "";
}

/** Strips any path and characters that are unsafe in a file name, keeping the extension. */
export function cleanFileName(name: string | null | undefined): string {
  const base = (name ?? "").split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f"<>:|?*]/g, "_").trim().slice(0, 150);
}

const baseMime = (mime: string | null | undefined) => (mime ?? "").split(";")[0].trim().toLowerCase();

/** Works out a file's real type from its first bytes, for files stored without a usable type or name. */
export function sniffMime(bytes: Uint8Array): string | null {
  const head = Buffer.from(bytes.subarray(0, 16));
  const ascii = head.toString("latin1");
  if (ascii.startsWith("%PDF")) return "application/pdf";
  if (head[0] === 0x89 && ascii.slice(1, 4) === "PNG") return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WAVE") return "audio/wav";
  if (ascii.startsWith("OggS")) return "audio/ogg";
  if (ascii.startsWith("ID3") || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii.slice(4, 8) === "ftyp") return "audio/mp4";
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return "audio/webm";
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return "application/msword";
  if (ascii.startsWith("PK")) {
    // Office files are zip archives; the folder names inside say which kind.
    const text = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 8192))).toString("latin1");
    if (text.includes("word/")) return MIME_BY_EXT.docx;
    if (text.includes("xl/")) return MIME_BY_EXT.xlsx;
    if (text.includes("ppt/")) return MIME_BY_EXT.pptx;
    const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.length - 65536))).toString("latin1");
    if (tail.includes("word/")) return MIME_BY_EXT.docx;
    if (tail.includes("xl/")) return MIME_BY_EXT.xlsx;
    if (tail.includes("ppt/")) return MIME_BY_EXT.pptx;
  }
  return null;
}

export type StoredUpload = { dataUrl: string; mimeType: string; fileName: string; sizeBytes: number; bytes: Buffer };

/** Reads an uploaded file into the stored form, settling its type from the name or contents when the browser gave none. */
export async function readUpload(file: File): Promise<StoredUpload> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const fileName = cleanFileName(file.name);
  // The extension decides when we know it: the browser's own label is often blank or wrong, and
  // is whatever the sender claims.
  let mimeType = MIME_BY_EXT[extOf(fileName)] ?? baseMime(file.type);
  if (GENERIC_MIMES.has(mimeType)) mimeType = sniffMime(bytes) ?? "application/octet-stream";
  return { dataUrl: `data:${mimeType};base64,${bytes.toString("base64")}`, mimeType, fileName, sizeBytes: bytes.length, bytes };
}

export function decodeDataUrl(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl, "base64");
}

/**
 * The type and file name to send a stored file back with. Uses the original name when we have it;
 * for older files stored without one, rebuilds a name from `fallbackName` plus the right extension,
 * reading the file's own bytes if the stored type is missing or generic.
 */
export function resolveDownload(input: {
  bytes: Uint8Array;
  mimeType: string | null;
  fileName: string | null;
  fallbackName: string;
}): { mimeType: string; fileName: string } {
  const storedName = cleanFileName(input.fileName);
  let mimeType = baseMime(input.mimeType);
  if (GENERIC_MIMES.has(mimeType)) {
    mimeType = MIME_BY_EXT[extOf(storedName)] ?? sniffMime(input.bytes) ?? "application/octet-stream";
  }
  if (storedName && extOf(storedName)) return { mimeType, fileName: storedName };

  const base = storedName || cleanFileName(input.fallbackName) || "download";
  const ext = EXT_BY_MIME[mimeType];
  const fileName = ext && extOf(base) !== ext ? `${base}.${ext}` : base;
  return { mimeType, fileName };
}

/**
 * Sends a stored file. `inline` shows it in the browser (previews, audio players); otherwise it
 * downloads. Honours Range requests, which Safari needs before it will play audio.
 */
export function fileResponse(req: Request, bytes: Uint8Array, opts: { mimeType: string; fileName: string; inline?: boolean }): NextResponse {
  const asciiName = opts.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const headers: Record<string, string> = {
    "content-type": opts.mimeType,
    "content-disposition": `${opts.inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(opts.fileName)}`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = bytes.length;
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    if (!range[1]) start = Math.max(0, size - Number(range[2]));
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    }
    const chunk = bytes.subarray(start, end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(chunk.length) },
    });
  }

  return new NextResponse(new Uint8Array(bytes), { headers: { ...headers, "content-length": String(bytes.length) } });
}
