import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { adminAssistantChats, adminAssistantMessages } from "@/db/schema";
import { getStaff } from "@/lib/staff-auth";
import { buildAdminAssistantSystemPrompt } from "@/lib/ai/admin-assistant";
import { AiUnavailableError, runCompletion } from "@/lib/ai/gateway";
import { rateLimit } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  chatId: z.coerce.number().int().positive().optional(),
  message: z.string().trim().min(1).max(1000),
});

export async function POST(req: Request) {
  const staff = await getStaff();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`admin-assistant:${staff.id}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many messages. Please try again shortly." },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Message must be between 1 and 1000 characters." }, { status: 400 });
  }

  let database;
  try {
    database = requireDb();
  } catch {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  // Resolve or create the chat, verifying ownership (a staff member may only
  // append to their own conversations).
  let chatId = parsed.data.chatId ?? null;
  if (chatId) {
    const owned = await database
      .select({ id: adminAssistantChats.id })
      .from(adminAssistantChats)
      .where(and(eq(adminAssistantChats.id, chatId), eq(adminAssistantChats.staffId, staff.id)))
      .limit(1);
    if (!owned[0]) chatId = null;
  }
  if (!chatId) {
    const created = await database
      .insert(adminAssistantChats)
      .values({
        staffId: staff.id,
        title: parsed.data.message.slice(0, 60) + (parsed.data.message.length > 60 ? "…" : ""),
      })
      .returning({ id: adminAssistantChats.id });
    chatId = created[0].id;
  }

  await database.insert(adminAssistantMessages).values({
    chatId,
    role: "user",
    content: parsed.data.message,
  });

  const history = await database
    .select({ role: adminAssistantMessages.role, content: adminAssistantMessages.content })
    .from(adminAssistantMessages)
    .where(eq(adminAssistantMessages.chatId, chatId))
    .orderBy(asc(adminAssistantMessages.createdAt));
  const recent = history.slice(-14);

  try {
    const { system, evidence } = await buildAdminAssistantSystemPrompt(staff, parsed.data.message);
    const completion = await runCompletion({
      system,
      turns: recent.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
      maxTokens: 800,
      totalTimeoutMs: 30_000,
    });

    await database.insert(adminAssistantMessages).values({
      chatId,
      role: "assistant",
      content: completion.text,
      evidence,
    });

    return NextResponse.json({ reply: completion.text, chatId, provider: completion.provider, evidence });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "The assistant is temporarily unavailable. Please try again in a moment." },
        { status: 503 },
      );
    }
    console.error("admin assistant chat:", err);
    return NextResponse.json({ error: "Something went wrong handling your question." }, { status: 500 });
  }
}
