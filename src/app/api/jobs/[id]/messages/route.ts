import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CHAT_MESSAGE_MAX,
  chatParticipantsNote,
  chatRealtimeProps,
  listJobMessages,
  postJobMessage,
  resolveChatParticipant,
} from "@/lib/job-chat";
import { CHAT_ATTACHMENT_EXTS, MAX_UPLOAD_BYTES, extOf, readUpload, type StoredUpload } from "@/lib/uploads";

export const dynamic = "force-dynamic";

const roleSchema = z.enum(["client", "staff", "inspector"]);

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * The job chat's messages. `?after=<id>` returns only newer ones (what the open chat checks with).
 * `?meta=1` adds what the floating chat needs to open this conversation from scratch: the job's
 * reference and title, who is in the chat, and the live channel to listen on.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const role = roleSchema.safeParse(url.searchParams.get("as"));
  if (!role.success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const participant = await resolveChatParticipant(Number(id), role.data);
  if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const after = Number(url.searchParams.get("after"));
  const messages = await listJobMessages(participant.job.id, Number.isInteger(after) && after > 0 ? after : 0);
  const meta =
    url.searchParams.get("meta") === "1"
      ? {
          ref: participant.job.ref,
          title: `${participant.job.service}${participant.job.location ? `, ${participant.job.location}` : ""}`,
          participantsNote: await chatParticipantsNote(participant),
          realtime: chatRealtimeProps(participant.job.id),
        }
      : undefined;
  return NextResponse.json({ messages, meta }, { headers: { "Cache-Control": "no-store" } });
}

const ATTACHMENT_TOO_BIG = "That file is larger than 4 MB.";

/**
 * Posts a message. Sent as form data: `as`, `body`, and optionally one `file` (a document, picture
 * or audio clip up to 4 MB). A message needs text, a file, or both.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Sessions are cookies, so only accept posts made from our own pages.
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  // Vercel rejects bodies above about 4.5 MB before this runs; refuse early with a clear message.
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: ATTACHMENT_TOO_BIG }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Enter a message." }, { status: 400 });
  }
  const role = roleSchema.safeParse(form.get("as"));
  if (!role.success) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const participant = await resolveChatParticipant(Number(id), role.data);
  if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawBody = form.get("body");
  const body = typeof rawBody === "string" ? rawBody.trim() : "";
  if (body.length > CHAT_MESSAGE_MAX) {
    return NextResponse.json({ error: "Keep messages under 2,000 characters." }, { status: 400 });
  }

  const file = form.get("file");
  let upload: StoredUpload | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: ATTACHMENT_TOO_BIG }, { status: 413 });
    if (!CHAT_ATTACHMENT_EXTS.includes(extOf(file.name))) {
      return NextResponse.json(
        { error: "That file type isn't supported. Send a PDF, Word, Excel, PowerPoint, CSV or text file, a picture, or an audio file." },
        { status: 400 },
      );
    }
    upload = await readUpload(file);
  }
  if (!body && !upload) return NextResponse.json({ error: "Enter a message or attach a file." }, { status: 400 });

  try {
    const message = await postJobMessage(participant, body, upload);
    return NextResponse.json({ message });
  } catch (err) {
    console.error("job chat post:", err);
    return NextResponse.json({ error: "Could not send. Please try again." }, { status: 500 });
  }
}
