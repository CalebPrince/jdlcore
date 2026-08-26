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

/* ---------------- Invoice settings (doc section 16: Administrator "Invoice settings") ---------------- */

export type InvoiceSettings = {
  invoicePrefix: string;
  defaultCurrency: string;
  termsDays: string;
  paymentInstructions: string;
  closingNote: string;
};

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  invoicePrefix: "INV",
  defaultCurrency: "GHS",
  termsDays: "14",
  paymentInstructions: "Payment details are provided on request. Quote this invoice number as reference.",
  closingNote: "Thank you for working with JDL Core.",
};

const INVOICE_KEY_BY_FIELD: Record<keyof InvoiceSettings, string> = {
  invoicePrefix: "invoice_prefix",
  defaultCurrency: "invoice_default_currency",
  termsDays: "invoice_terms_days",
  paymentInstructions: "invoice_payment_instructions",
  closingNote: "invoice_closing_note",
};

const INVOICE_FIELDS = Object.keys(INVOICE_KEY_BY_FIELD) as (keyof InvoiceSettings)[];

export async function getInvoiceSettings(): Promise<InvoiceSettings> {
  if (!db) return DEFAULT_INVOICE_SETTINGS;
  try {
    const rows = await db.select().from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const out = { ...DEFAULT_INVOICE_SETTINGS };
    for (const field of INVOICE_FIELDS) {
      const value = map.get(INVOICE_KEY_BY_FIELD[field]);
      if (value) out[field] = value;
    }
    return out;
  } catch {
    return DEFAULT_INVOICE_SETTINGS;
  }
}

export async function saveInvoiceSettings(input: InvoiceSettings): Promise<void> {
  const database = requireDb();
  const rows = INVOICE_FIELDS.map((field) => ({
    key: INVOICE_KEY_BY_FIELD[field],
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

/* ---------------- Report template settings (doc section 16: Administrator "Report templates") ---------------- */

export type ReportSettings = {
  coqPrefix: string;
  headerTagline: string;
  certifyingStatement: string;
};

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  coqPrefix: "COQ",
  headerTagline: "INSPECTION & QUANTITY SURVEYING",
  certifyingStatement:
    "This certificate documents independent quantity verification by JDL Core Inspection Services.",
};

const REPORT_KEY_BY_FIELD: Record<keyof ReportSettings, string> = {
  coqPrefix: "report_coq_prefix",
  headerTagline: "report_header_tagline",
  certifyingStatement: "report_certifying_statement",
};

const REPORT_FIELDS = Object.keys(REPORT_KEY_BY_FIELD) as (keyof ReportSettings)[];

export async function getReportSettings(): Promise<ReportSettings> {
  if (!db) return DEFAULT_REPORT_SETTINGS;
  try {
    const rows = await db.select().from(settings);
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const out = { ...DEFAULT_REPORT_SETTINGS };
    for (const field of REPORT_FIELDS) {
      const value = map.get(REPORT_KEY_BY_FIELD[field]);
      if (value) out[field] = value;
    }
    return out;
  } catch {
    return DEFAULT_REPORT_SETTINGS;
  }
}

export async function saveReportSettings(input: ReportSettings): Promise<void> {
  const database = requireDb();
  const rows = REPORT_FIELDS.map((field) => ({
    key: REPORT_KEY_BY_FIELD[field],
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
