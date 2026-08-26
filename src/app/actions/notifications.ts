"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { notifications } from "@/db/schema";
import { getPortalClient } from "@/lib/portal-auth";
import { getInspector } from "@/lib/inspector-auth";
import { getStaff } from "@/lib/staff-auth";
import type { RecipientType } from "@/lib/notifications";

async function currentRecipient(): Promise<{ type: RecipientType; id: number } | null> {
  const portal = await getPortalClient();
  if (portal) return { type: "client", id: portal.id };
  const inspector = await getInspector();
  if (inspector) return { type: "inspector", id: inspector.id };
  const staff = await getStaff();
  if (staff) return { type: "staff", id: staff.id };
  return null;
}

export async function markNotificationRead(notificationId: number): Promise<void> {
  const recipient = await currentRecipient();
  if (!recipient) return;

  await requireDb()
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientType, recipient.type),
        eq(notifications.recipientId, recipient.id),
      ),
    );

  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
  const recipient = await currentRecipient();
  if (!recipient) return;

  await requireDb()
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.recipientType, recipient.type),
        eq(notifications.recipientId, recipient.id),
        eq(notifications.read, false),
      ),
    );

  revalidatePath("/", "layout");
}
