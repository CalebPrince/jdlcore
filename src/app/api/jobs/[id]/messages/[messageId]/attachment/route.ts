import { NextResponse } from "next/server";
import { z } from "zod";
import { getJobMessageAttachment, resolveChatParticipant } from "@/lib/job-chat";
import { decodeDataUrl, fileResponse, resolveDownload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const roleSchema = z.enum(["client", "staff", "inspector"]);

/**
 * A chat message's attachment, for the people in that job's chat only. Audio plays in the page
 * (`?inline=1`, used by the chat's player); everything else, and every plain request, downloads as
 * the original file.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const { id, messageId } = await params;
  const url = new URL(req.url);
  const role = roleSchema.safeParse(url.searchParams.get("as"));
  if (!role.success) return new NextResponse("Not found", { status: 404 });

  const participant = await resolveChatParticipant(Number(id), role.data);
  const msgId = Number(messageId);
  if (!participant || !Number.isInteger(msgId) || msgId <= 0) return new NextResponse("Not found", { status: 404 });

  const attachment = await getJobMessageAttachment(participant.job.id, msgId);
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const bytes = decodeDataUrl(attachment.data);
  const resolved = resolveDownload({ bytes, mimeType: attachment.mimeType, fileName: attachment.name, fallbackName: "attachment" });
  const playable = resolved.mimeType.startsWith("audio/") || resolved.mimeType === "video/webm";
  return fileResponse(req, bytes, { ...resolved, inline: playable && url.searchParams.get("inline") === "1" });
}
