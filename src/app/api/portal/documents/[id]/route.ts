import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { documents, jobs } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { getStaff } from "@/lib/staff-auth";
import { getInspector } from "@/lib/inspector-auth";
import { decodeDataUrl, fileResponse, resolveDownload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/** Types safe to show inside the page for a preview. Anything else always downloads. */
const PREVIEWABLE = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

/**
 * A job document, for the job's client, any signed-in staff member, or the inspector assigned to
 * the job. Sent back as the file that was uploaded: original name, extension and type.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const preview = new URL(req.url).searchParams.get("preview") === "1";
  const client = await getPortalClient();
  const staff = client ? null : await getStaff();
  const inspector = client || staff ? null : await getInspector();
  if (!client && !staff && !inspector) return new NextResponse("Unauthorized", { status: 401 });

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
    .where(
      client
        ? and(eq(documents.id, docId), eq(jobs.clientId, client.id))
        : inspector
          ? and(eq(documents.id, docId), eq(jobs.assignedInspectorId, inspector.id))
          : eq(documents.id, docId),
    )
    .limit(1);
  const entry = rows[0];
  if (!entry) return new NextResponse("Not found", { status: 404 });

  const doc = entry.doc;
  if (doc.url) return NextResponse.redirect(doc.url);
  if (!doc.fileData) return new NextResponse("No file content", { status: 404 });

  const bytes = decodeDataUrl(doc.fileData);
  const resolved = resolveDownload({ bytes, mimeType: doc.mimeType, fileName: doc.fileName, fallbackName: doc.title });
  return fileResponse(req, bytes, { ...resolved, inline: preview && PREVIEWABLE.has(resolved.mimeType) });
}
