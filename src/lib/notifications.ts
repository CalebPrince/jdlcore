import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { notifications, staff } from "@/db/schema";
import { sendNotification } from "@/lib/email";
import type { StaffRole } from "@/lib/staff-auth";

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

/** Fires both the in-app bell and a real email for one recipient. */
export async function notifyBoth(input: {
  recipientType: RecipientType;
  recipientId: number;
  email: string;
  jobId?: number | null;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  emailSubject: string;
  emailHtml: string;
}): Promise<void> {
  await notify({
    recipientType: input.recipientType,
    recipientId: input.recipientId,
    jobId: input.jobId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link,
  });
  await sendNotification({ to: input.email, subject: input.emailSubject, html: input.emailHtml });
}

/** Fires both the in-app bell and a real email for every active staff member (optionally role-filtered). */
export async function notifyStaffBoth(input: {
  roles?: StaffRole[];
  type: string;
  title: string;
  body: string;
  link?: string;
  emailSubject: string;
  emailHtml: string;
}): Promise<void> {
  try {
    const database = requireDb();
    const rows = await database
      .select({ id: staff.id, email: staff.email })
      .from(staff)
      .where(
        input.roles && input.roles.length > 0
          ? and(eq(staff.status, "active"), inArray(staff.role, input.roles))
          : eq(staff.status, "active"),
      );
    for (const s of rows) {
      await notifyBoth({
        recipientType: "staff",
        recipientId: s.id,
        email: s.email,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        emailSubject: input.emailSubject,
        emailHtml: input.emailHtml,
      });
    }
  } catch (err) {
    console.error("notifyStaffBoth:", err);
  }
}
