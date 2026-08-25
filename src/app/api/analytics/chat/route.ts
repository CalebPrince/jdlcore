import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { analyticsChats, analyticsMessages } from "@/db/schema";
import { getAnalyticsUser } from "@/lib/analytics-auth";
import { buildAnalyticsSystemPrompt } from "@/lib/ai/analytics-prompt";
import { runCompletion, AiUnavailableError } from "@/lib/ai/gateway";

const DAILY_LIMIT = 100;

const bodySchema = z.object({
  chatId: z.coerce.number().int().positive().optional(),
  message: z.string().trim().min(1).max(2000),
});

/** In-memory per-user daily counter (resets on restart; per-instance). */
const usage = new Map<string, { day: string; count: number }>();
function withinDailyLimit(userId: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const key = String(userId);
  const entry = usage.get(key);
  if (!entry || entry.day !== day) {
    usage.set(key, { day, count: 1 });
    return true;
  }
  if (entry.count >= DAILY_LIMIT) return false;
  entry.count += 1;
  return true;
}

export async function POST(req: Request) {
  const user = await getAnalyticsUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Message must be between 1 and 2000 characters." },
      { status: 400 },
    );
  }
  if (!withinDailyLimit(user.id)) {
    return NextResponse.json(
      {
        error: `Daily limit of ${DAILY_LIMIT} messages reached. Your limit resets at midnight.`,
      },
      { status: 429 },
    );
  }

  let database;
  try {
    database = requireDb();
  } catch {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  // Resolve or create the chat, verifying ownership
  let chatId = parsed.data.chatId ?? null;
  if (chatId) {
    const owned = await database
      .select({ id: analyticsChats.id })
      .from(analyticsChats)
      .where(and(eq(analyticsChats.id, chatId), eq(analyticsChats.userId, user.id)))
      .limit(1);
    if (!owned[0]) chatId = null;
  }
  if (!chatId) {
    const created = await database
      .insert(analyticsChats)
      .values({
        userId: user.id,
        title:
          parsed.data.message.slice(0, 60) + (parsed.data.message.length > 60 ? "…" : ""),
      })
      .returning({ id: analyticsChats.id });
    chatId = created[0].id;
  }

  await database.insert(analyticsMessages).values({
    chatId,
    role: "user",
    content: parsed.data.message,
  });

  const history = await database
    .select({ role: analyticsMessages.role, content: analyticsMessages.content })
    .from(analyticsMessages)
    .where(eq(analyticsMessages.chatId, chatId))
    .orderBy(asc(analyticsMessages.createdAt));
  const recent = history.slice(-14);

  // RAG seam: retrieved document context goes here in a later iteration.
  const contextBlocks: string[] = [];
  const system = await buildAnalyticsSystemPrompt(user, contextBlocks);

  try {
    const completion = await runCompletion({
      system,
      turns: recent.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
      maxTokens: 900,
      totalTimeoutMs: 45_000,
    });

    await database.insert(analyticsMessages).values({
      chatId,
      role: "assistant",
      content: completion.text,
    });

    return NextResponse.json({ reply: completion.text, chatId, provider: completion.provider });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json(
        {
          error:
            "The assistant is temporarily unavailable. Please try again in a moment.",
        },
        { status: 503 },
      );
    }
    console.error("analytics chat:", err);
    return NextResponse.json(
      { error: "Something went wrong handling your question." },
      { status: 500 },
    );
  }
}
