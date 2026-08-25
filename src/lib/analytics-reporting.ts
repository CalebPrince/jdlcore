import "server-only";

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { analyticsChats, analyticsDailyUsage, analyticsMessages, analyticsUsers } from "@/db/schema";

type StoredSource = { docId?: number; title?: string };

export async function getAnalyticsReport(days = 14) {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  const startDate = start.toISOString().slice(0, 10);

  const dates = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });

  const emptyReport = {
    days,
    generatedAt: now,
    metrics: { activeSubscribers: 0, questions: 0, conversations: 0, todayUsed: 0, todayCapacity: 0 },
    daily: dates.map((date) => ({ date, count: 0 })),
    subscribers: [] as { id: number; name: string; company: string | null; status: string; dailyLimit: number; lastLoginAt: Date | null; questions: number; conversations: number }[],
    documents: [] as { title: string; citations: number }[],
  };

  let database;
  try {
    database = requireDb();
  } catch (err) {
    console.error("analytics-reporting: database not available", err);
    return emptyReport;
  }

  try {
    const [users, dailyRows, questionRows, chatRows, sourceRows] = await Promise.all([
      database.select({ id: analyticsUsers.id, name: analyticsUsers.name, company: analyticsUsers.company, status: analyticsUsers.status, dailyLimit: analyticsUsers.dailyLimit, lastLoginAt: analyticsUsers.lastLoginAt }).from(analyticsUsers).orderBy(analyticsUsers.name),
      database.select({ userId: analyticsDailyUsage.userId, usageDate: analyticsDailyUsage.usageDate, count: analyticsDailyUsage.messageCount }).from(analyticsDailyUsage).where(gte(analyticsDailyUsage.usageDate, startDate)).orderBy(analyticsDailyUsage.usageDate),
      database.select({ userId: analyticsChats.userId, createdAt: analyticsMessages.createdAt }).from(analyticsMessages).innerJoin(analyticsChats, eq(analyticsMessages.chatId, analyticsChats.id)).where(and(eq(analyticsMessages.role, "user"), gte(analyticsMessages.createdAt, start))),
      database.select({ userId: analyticsChats.userId, total: sql<number>`count(*)::int` }).from(analyticsChats).where(gte(analyticsChats.createdAt, start)).groupBy(analyticsChats.userId),
      database.select({ sources: analyticsMessages.sources }).from(analyticsMessages).where(and(eq(analyticsMessages.role, "assistant"), gte(analyticsMessages.createdAt, start))).orderBy(desc(analyticsMessages.createdAt)),
    ]);

    const dailyTotals = new Map(dates.map((date) => [date, 0]));
    const usedByUser = new Map<number, number>();
    for (const row of dailyRows) {
      dailyTotals.set(row.usageDate, (dailyTotals.get(row.usageDate) ?? 0) + row.count);
      usedByUser.set(row.userId, (usedByUser.get(row.userId) ?? 0) + row.count);
    }
    const chatsByUser = new Map(chatRows.map((row) => [row.userId, Number(row.total)]));
    const documentHits = new Map<string, number>();
    for (const row of sourceRows) {
      if (!Array.isArray(row.sources)) continue;
      for (const source of row.sources as StoredSource[]) {
        if (!source?.title) continue;
        documentHits.set(source.title, (documentHits.get(source.title) ?? 0) + 1);
      }
    }
    const activeUsers = users.filter((user) => user.status === "active");
    const today = now.toISOString().slice(0, 10);
    const todayUsed = dailyRows.filter((row) => row.usageDate === today).reduce((sum, row) => sum + row.count, 0);
    const todayCapacity = activeUsers.reduce((sum, user) => sum + user.dailyLimit, 0);

    return {
      days,
      generatedAt: now,
      metrics: {
        activeSubscribers: activeUsers.length,
        questions: questionRows.length,
        conversations: chatRows.reduce((sum, row) => sum + Number(row.total), 0),
        todayUsed,
        todayCapacity,
      },
      daily: dates.map((date) => ({ date, count: dailyTotals.get(date) ?? 0 })),
      subscribers: users.map((user) => ({ ...user, questions: usedByUser.get(user.id) ?? 0, conversations: chatsByUser.get(user.id) ?? 0 })),
      documents: [...documentHits.entries()].map(([title, citations]) => ({ title, citations })).toSorted((a, b) => b.citations - a.citations),
    };
  } catch (err) {
    console.error("analytics-reporting: query failed", err);
    return emptyReport;
  }
}
