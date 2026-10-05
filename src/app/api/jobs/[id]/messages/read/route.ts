import { NextResponse } from "next/server";
import { z } from "zod";
import { markChatRead, resolveChatParticipant } from "@/lib/job-chat";

export const dynamic = "force-dynamic";

const schema = z.object({
  as: z.enum(["client", "staff", "inspector"]),
  lastId: z.number().int().positive(),
});

/** Called by an open, on-screen chat to record how far its viewer has read (clears their unread badge). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const participant = await resolveChatParticipant(Number(id), parsed.data.as);
  if (!participant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await markChatRead(participant, parsed.data.lastId);
  return NextResponse.json({ ok: true });
}
