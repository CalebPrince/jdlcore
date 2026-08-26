import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { notifications } from "@/db/schema";

export type RecipientType = "client" | "inspector" | "staff";

export async function notify(input: {
  recipientType: RecipientType;
  recipientId: number;
  jobId?: number | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
}): Promise<void> {
  try {
    const database = requireDb();
    await database.insert(notifications).values({
      recipientType: input.recipientType,
      recipientId: input.recipientId,
      jobId: input.jobId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    });
  } catch (err) {
    // Notifications are best-effort — never let a notify() failure break the
    // action that triggered it.
    console.error("notify:", err);
  }
}

export async function unreadCount(recipientType: RecipientType, recipientId: number): Promise<number> {
  try {
    const database = requireDb();
    const rows = await database
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientType, recipientType),
          eq(notifications.recipientId, recipientId),
          eq(notifications.read, false),
        ),
      );
    return rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function recentNotifications(
  recipientType: RecipientType,
  recipientId: number,
  limit = 20,
) {
  try {
    const database = requireDb();
    return await database
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientType, recipientType),
          eq(notifications.recipientId, recipientId),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  } catch {
    return [];
  }
}
