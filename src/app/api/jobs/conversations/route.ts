import { NextResponse } from "next/server";
import { z } from "zod";
import { listConversations, resolveChatViewer } from "@/lib/job-chat";

export const dynamic = "force-dynamic";

const roleSchema = z.enum(["client", "staff", "inspector"]);

/** The signed-in person's job chats with unread counts, for the floating chat button and its list. */
export async function GET(req: Request) {
  const role = roleSchema.safeParse(new URL(req.url).searchParams.get("as"));
  if (!role.success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const viewer = await resolveChatViewer(role.data);
  if (!viewer) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const conversations = await listConversations(viewer.role, viewer.id);
  return NextResponse.json({ conversations }, { headers: { "Cache-Control": "no-store" } });
}
