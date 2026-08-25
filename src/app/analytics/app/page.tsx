import { and, asc, desc, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { analyticsChats, analyticsMessages } from "@/db/schema";
import { getAnalyticsUser } from "@/lib/analytics-auth";
import { ChatWorkspace } from "@/components/analytics/chat-workspace";

export const dynamic = "force-dynamic";

export default async function AnalyticsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const user = await getAnalyticsUser();
  if (!user) return null;
  const { c } = await searchParams;

  let chats: { id: number; title: string }[] = [];
  let activeChatId: number | null = null;
  let initialMessages: { role: "user" | "assistant"; content: string }[] = [];

  try {
    const database = requireDb();
    chats = await database
      .select({ id: analyticsChats.id, title: analyticsChats.title })
      .from(analyticsChats)
      .where(eq(analyticsChats.userId, user.id))
      .orderBy(desc(analyticsChats.createdAt))
      .limit(30);

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
    activeChatId ??= chats[0]?.id ?? null;

    if (activeChatId) {
      const rows = await database
        .select({
          role: analyticsMessages.role,
          content: analyticsMessages.content,
        })
        .from(analyticsMessages)
        .where(eq(analyticsMessages.chatId, activeChatId))
        .orderBy(asc(analyticsMessages.createdAt));
      initialMessages = rows.map((r) => ({
        role: r.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: r.content,
      }));
    }
  } catch (err) {
    console.error("analytics app page:", err);
  }

  return (
    <ChatWorkspace
      userName={user.name}
      chats={chats}
      activeChatId={activeChatId}
      initialMessages={initialMessages}
    />
  );
}
