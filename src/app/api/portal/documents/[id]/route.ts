import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { documents, jobs } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const client = await getPortalClient();
  if (!client) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const database = requireDb();
  const rows = await database
    .select({ doc: documents })
    .from(documents)
    .innerJoin(jobs, eq(documents.jobId, jobs.id))
    .where(and(eq(documents.id, docId), eq(jobs.clientId, client.id)))
    .limit(1);
  const entry = rows[0];
  if (!entry) return new NextResponse("Not found", { status: 404 });

  const doc = entry.doc;
  if (doc.url) return NextResponse.redirect(doc.url);
  if (!doc.fileData) return new NextResponse("No file content", { status: 404 });

  const base64 = doc.fileData.includes(",")
    ? doc.fileData.split(",")[1]
    : doc.fileData;
  const bytes = Buffer.from(base64, "base64");
  const mimeType = doc.mimeType ?? "application/octet-stream";
  const ext = EXT_BY_MIME[mimeType];
  const safeTitle = doc.title.replace(/[^a-z0-9 ._-]/gi, "_");
  const filename = ext && !safeTitle.toLowerCase().endsWith(`.${ext}`) ? `${safeTitle}.${ext}` : safeTitle;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": mimeType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}
