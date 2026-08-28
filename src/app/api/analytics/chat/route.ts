import { NextResponse } from "next/server";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { analyticsChats, analyticsDailyUsage, analyticsMessages } from "@/db/schema";
import { getAnalyticsUser } from "@/lib/analytics-auth";
import { buildAnalyticsSystemPrompt } from "@/lib/ai/analytics-prompt";
import { runCompletion, AiUnavailableError } from "@/lib/ai/gateway";
import { retrieveKnowledge } from "@/lib/analytics-knowledge";

const bodySchema = z.object({
  chatId: z.coerce.number().int().positive().optional(),
  message: z.string().trim().min(1).max(2000),
});

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
  let database;
  try {
    database = requireDb();
  } catch {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  // Plan-tier monthly quota (Depot/Trader/etc.) — separate from the flat daily
  // anti-abuse throttle below. Legacy admin-invited accounts have no plan/period
  // set and are exempt.
  if (user.monthlyQuestionLimit !== null && user.currentPeriodStart && user.currentPeriodEnd) {
    const periodStart = user.currentPeriodStart.toISOString().slice(0, 10);
    const periodEndExclusive = user.currentPeriodEnd.toISOString().slice(0, 10);
    const monthlyRows = await database
      .select({ total: sql<number>`coalesce(sum(${analyticsDailyUsage.messageCount}), 0)::int` })
      .from(analyticsDailyUsage)
      .where(
        and(
          eq(analyticsDailyUsage.userId, user.id),
          gte(analyticsDailyUsage.usageDate, periodStart),
          lt(analyticsDailyUsage.usageDate, periodEndExclusive),
        ),
      );
    const usedThisPeriod = monthlyRows[0]?.total ?? 0;
    if (usedThisPeriod >= user.monthlyQuestionLimit) {
      return NextResponse.json(
        {
          error: `Monthly limit of ${user.monthlyQuestionLimit} questions reached for your plan. It resets ${periodEndExclusive}.`,
        },
        { status: 429 },
      );
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const usageRows = await database
    .insert(analyticsDailyUsage)
    .values({ userId: user.id, usageDate: today, messageCount: 1 })
    .onConflictDoUpdate({
      target: [analyticsDailyUsage.userId, analyticsDailyUsage.usageDate],
      set: {
        messageCount: sql`${analyticsDailyUsage.messageCount} + 1`,
        updatedAt: new Date(),
      },
      setWhere: lt(analyticsDailyUsage.messageCount, user.dailyLimit),
    })
    .returning({ count: analyticsDailyUsage.messageCount });
  if (!usageRows[0]) {
    return NextResponse.json(
      { error: `Daily limit of ${user.dailyLimit} messages reached. Your limit resets at midnight UTC.` },
      { status: 429 },
    );
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

  const sources = await retrieveKnowledge(parsed.data.message, user.clientId);
  const contextBlocks = sources.map((source) => `${source.title}\n${source.quote}`);
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
      sources,
    });

    return NextResponse.json({ reply: completion.text, chatId, provider: completion.provider, sources, usage: { used: usageRows[0].count, limit: user.dailyLimit } });
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
