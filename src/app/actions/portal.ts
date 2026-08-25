"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { clients } from "@/db/schema";
import {
  createPortalSession,
  destroyPortalSession,
  verifyPassword,
} from "@/lib/portal-auth";

export type PortalFormState = { ok: boolean; message: string };

const schema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export async function portalLogin(
  _prev: PortalFormState,
  formData: FormData,
): Promise<PortalFormState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid email and password." };
  }

  let database;
  try {
    database = requireDb();
  } catch {
    return { ok: false, message: "Service temporarily unavailable." };
  }

  const rows = await database
    .select()
    .from(clients)
    .where(eq(clients.email, parsed.data.email.toLowerCase()))
    .limit(1);
  const client = rows[0];

  if (!client || !client.active || !verifyPassword(parsed.data.password, client.passwordHash)) {
    return { ok: false, message: "Invalid email or password." };
  }

  await createPortalSession(client.id);
  redirect("/portal");
}

export async function portalLogout(): Promise<void> {
  await destroyPortalSession();
  redirect("/portal/login");
}
