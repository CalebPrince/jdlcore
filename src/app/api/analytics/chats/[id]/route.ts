import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { analyticsChats } from "@/db/schema";
import { getAnalyticsUser } from "@/lib/analytics-auth";

const renameSchema = z.object({ title: z.string().trim().min(1).max(80) });

async function ownedChat(id: number, userId: number) {
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = await requireDb()
    .select({ id: analyticsChats.id })
    .from(analyticsChats)
    .where(and(eq(analyticsChats.id, id), eq(analyticsChats.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAnalyticsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!(await ownedChat(id, user.id))) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Use a title between 1 and 80 characters." }, { status: 400 });
  await requireDb().update(analyticsChats).set({ title: parsed.data.title }).where(eq(analyticsChats.id, id));
  return NextResponse.json({ id, title: parsed.data.title });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAnalyticsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  if (!(await ownedChat(id, user.id))) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  await requireDb().delete(analyticsChats).where(and(eq(analyticsChats.id, id), eq(analyticsChats.userId, user.id)));
  return NextResponse.json({ ok: true });
}
