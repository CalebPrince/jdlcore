import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { analyticsChats, analyticsDailyUsage, analyticsMessages } from "@/db/schema";
import { getAnalyticsUser } from "@/lib/analytics-auth";
import { ChatWorkspace } from "@/components/analytics/chat-workspace";

export const dynamic = "force-dynamic";

export default async function AnalyticsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string }>;
}) {
  const user = await getAnalyticsUser();
  if (!user) return null;
  const { c, new: startNew } = await searchParams;

  let chats: { id: number; title: string }[] = [];
  let activeChatId: number | null = null;
  let initialMessages: { role: "user" | "assistant"; content: string; sources?: { docId: number; title: string; quote: string }[] }[] = [];
  let usedToday = 0;
  let monthlyUsed = 0;

  try {
    const database = requireDb();
    const [chatRows, usage] = await Promise.all([
      database.select({ id: analyticsChats.id, title: analyticsChats.title }).from(analyticsChats).where(eq(analyticsChats.userId, user.id)).orderBy(desc(analyticsChats.createdAt)).limit(30),
      database.select({ count: analyticsDailyUsage.messageCount }).from(analyticsDailyUsage).where(and(eq(analyticsDailyUsage.userId, user.id), eq(analyticsDailyUsage.usageDate, new Date().toISOString().slice(0, 10)))).limit(1),
    ]);
    chats = chatRows;
    usedToday = usage[0]?.count ?? 0;

    if (user.monthlyQuestionLimit !== null && user.currentPeriodStart && user.currentPeriodEnd) {
      const monthlyRows = await database
        .select({ total: sql<number>`coalesce(sum(${analyticsDailyUsage.messageCount}), 0)::int` })
        .from(analyticsDailyUsage)
        .where(
          and(
            eq(analyticsDailyUsage.userId, user.id),
            gte(analyticsDailyUsage.usageDate, user.currentPeriodStart.toISOString().slice(0, 10)),
            lt(analyticsDailyUsage.usageDate, user.currentPeriodEnd.toISOString().slice(0, 10)),
          ),
        );
      monthlyUsed = monthlyRows[0]?.total ?? 0;
    }

    const requestedId = Number(c);
    if (Number.isInteger(requestedId)) {
      const owned = await database
        .select({ id: analyticsChats.id })
        .from(analyticsChats)
        .where(
          and(
            eq(analyticsChats.id, requestedId),
            eq(analyticsChats.userId, user.id),
          ),
        )
        .limit(1);
      if (owned[0]) activeChatId = requestedId;
    }
    if (startNew !== "1") activeChatId ??= chats[0]?.id ?? null;

    if (activeChatId) {
      const rows = await database
        .select({
          role: analyticsMessages.role,
          content: analyticsMessages.content,
          sources: analyticsMessages.sources,
        })
        .from(analyticsMessages)
        .where(eq(analyticsMessages.chatId, activeChatId))
        .orderBy(asc(analyticsMessages.createdAt));
      initialMessages = rows.map((r) => ({
        role: r.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: r.content,
        sources: Array.isArray(r.sources) ? r.sources as { docId: number; title: string; quote: string }[] : undefined,
      }));
    }
  } catch (err) {
    console.error("analytics app page:", err);
  }

  return (
    <ChatWorkspace
      key={activeChatId ?? "new"}
      userName={user.name}
      chats={chats}
      activeChatId={activeChatId}
      initialMessages={initialMessages}
      initialUsedToday={usedToday}
      dailyLimit={user.dailyLimit}
      plan={user.plan}
      monthlyUsed={monthlyUsed}
      monthlyLimit={user.monthlyQuestionLimit}
      periodResetLabel={
        user.currentPeriodEnd
          ? user.currentPeriodEnd.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
          : null
      }
    />
  );
}
