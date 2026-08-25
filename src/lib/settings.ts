import "server-only";
import { sql } from "drizzle-orm";
import { db, requireDb } from "@/db";
import { settings } from "@/db/schema";

export type ContactSettings = {
  phoneDisplay: string;
  phoneHref: string;
  emailInfo: string;
  emailInspections: string;
  emailAcademy: string;
  address: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  whatsappMessage: string;
};

export const DEFAULT_SETTINGS: ContactSettings = {
  phoneDisplay: "+000 000 000 000",
  phoneHref: "tel:+000000000000",
  emailInfo: "info@jdlcore.com",
  emailInspections: "inspections@jdlcore.com",
  emailAcademy: "academy@jdlcore.com",
  address: "Accra, Ghana",
  whatsappNumber: "233243849861",
  whatsappDisplay: "+233 24 384 9861",
  whatsappMessage:
    "Hello JDL Core, I'd like to get in touch about your services.",
};

const KEY_BY_FIELD: Record<keyof ContactSettings, string> = {
  phoneDisplay: "phone_display",
  phoneHref: "phone_href",
  emailInfo: "email_info",
  emailInspections: "email_inspections",
  emailAcademy: "email_academy",
  address: "address",
  whatsappNumber: "whatsapp_number",
  whatsappDisplay: "whatsapp_display",
  whatsappMessage: "whatsapp_message",
};

const FIELDS = Object.keys(KEY_BY_FIELD) as (keyof ContactSettings)[];

export function whatsappLink(s: ContactSettings): string {
  return `https://wa.me/${s.whatsappNumber}?text=${encodeURIComponent(
    s.whatsappMessage
  )}`;
}

export async function getContactSettings(): Promise<ContactSettings> {
  if (!db) return DEFAULT_SETTINGS;
  try {
    const rows = await db.select().from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const out = { ...DEFAULT_SETTINGS };
    for (const field of FIELDS) {
      const value = map.get(KEY_BY_FIELD[field]);
      if (value) out[field] = value;
    }
    return out;
  } catch {
    // Site must render even if the database is unreachable.
    return DEFAULT_SETTINGS;
  }
}

export async function saveContactSettings(
  input: ContactSettings
): Promise<void> {
  const database = requireDb();
  const rows = FIELDS.map((field) => ({
    key: KEY_BY_FIELD[field],
    value: input[field],
  }));

  await database
    .insert(settings)
    .values(rows)
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value`, updatedAt: new Date() },
    });
}
