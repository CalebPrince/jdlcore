import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { adminAssistantChats, adminAssistantMessages } from "@/db/schema";
import { getStaff } from "@/lib/staff-auth";
import { AssistantWorkspace, type AssistantEvidence, type AssistantMessage } from "@/components/admin/assistant-workspace";

export const dynamic = "force-dynamic";

export default async function AdminAssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string }>;
}) {
  const staff = await getStaff();
  if (!staff) notFound();
  const { c, new: startNew } = await searchParams;

  let chats: { id: number; title: string }[] = [];
  let activeChatId: number | null = null;
  let initialMessages: AssistantMessage[] = [];

  try {
    const database = requireDb();
    chats = await database
      .select({ id: adminAssistantChats.id, title: adminAssistantChats.title })
      .from(adminAssistantChats)
      .where(eq(adminAssistantChats.staffId, staff.id))
      .orderBy(desc(adminAssistantChats.createdAt))
      .limit(30);

    const requestedId = Number(c);
    if (Number.isInteger(requestedId)) {
      const owned = await database
        .select({ id: adminAssistantChats.id })
        .from(adminAssistantChats)
        .where(and(eq(adminAssistantChats.id, requestedId), eq(adminAssistantChats.staffId, staff.id)))
        .limit(1);
      if (owned[0]) activeChatId = requestedId;
    }
    if (startNew !== "1") activeChatId ??= chats[0]?.id ?? null;

    if (activeChatId) {
      const rows = await database
        .select({
          role: adminAssistantMessages.role,
          content: adminAssistantMessages.content,
          evidence: adminAssistantMessages.evidence,
        })
        .from(adminAssistantMessages)
        .where(eq(adminAssistantMessages.chatId, activeChatId))
        .orderBy(asc(adminAssistantMessages.createdAt));
      initialMessages = rows.map((r) => ({
        role: r.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: r.content,
        evidence: Array.isArray(r.evidence) ? (r.evidence as AssistantEvidence[]) : undefined,
      }));
    }
  } catch (err) {
    console.error("admin assistant page:", err);
  }

  return (
    <AssistantWorkspace
      key={activeChatId ?? "new"}
      staffName={staff.name}
      chats={chats}
      activeChatId={activeChatId}
      initialMessages={initialMessages}
    />
  );
}
