"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffRole } from "@/lib/staff-auth";
import {
  DEFAULT_SETTINGS,
  saveAutomationSettings,
  saveContactSettings,
  saveInvoiceSettings,
  saveReportSettings,
} from "@/lib/settings";
import { SERVICE_TYPES } from "@/lib/jobs";
import { logAudit } from "@/lib/audit";

export type AdminState = { ok: boolean; message: string };

const ADMIN_ROLES = ["administrator", "superadmin"] as const;

const settingsSchema = z.object({
  phoneDisplay: z.string().trim().min(1),
  phoneHref: z.string().trim().min(1),
  emailInfo: z.string().trim().email(),
  emailInspections: z.string().trim().email(),
  emailAcademy: z.string().trim().email(),
  address: z.string().trim().min(1),
  whatsappNumber: z
    .string()
    .trim()
    .regex(/^\d{6,15}$/, "Digits only, international format (e.g. 233243849861)"),
  whatsappDisplay: z.string().trim().min(1),
  whatsappMessage: z.string().trim().min(1),
});

export async function updateContactSettings(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const current = await requireStaffRole(["administrator", "superadmin"]);
  if (!current) {
    return { ok: false, message: "Not signed in." };
  }
  const parsed = settingsSchema.safeParse({
    phoneDisplay: formData.get("phoneDisplay"),
    phoneHref: normalizePhoneHref(formData.get("phoneHref")),
    emailInfo: formData.get("emailInfo"),
    emailInspections: formData.get("emailInspections"),
    emailAcademy: formData.get("emailAcademy"),
    address: formData.get("address"),
    whatsappNumber: String(formData.get("whatsappNumber") ?? "")
      .replace(/[\s()+-]/g, ""),
    whatsappDisplay: formData.get("whatsappDisplay"),
    whatsappMessage: formData.get("whatsappMessage"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0].message,
    };
  }
  try {
    await saveContactSettings(parsed.data);
  } catch {
    return { ok: false, message: "We couldn't save your changes right now. Please try again in a moment." };
  }
  revalidatePath("/", "layout");
  await logAudit({
    actor: current,
    action: "settings.contact_updated",
    targetType: "settings",
    summary: "Updated site contact details.",
  });
  return { ok: true, message: "Contact details saved and live on the site." };
}

function normalizePhoneHref(input: FormDataEntryValue | null): string {
  const raw = String(input ?? "").trim();
  if (!raw) return DEFAULT_SETTINGS.phoneHref;
  if (/^tel:/i.test(raw)) return raw;
  return `tel:${raw.replace(/[\s()-]/g, "")}`;
}

/* ---------------- Invoice settings ---------------- */

const invoiceSettingsSchema = z.object({
  invoicePrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers, and dashes only."),
  defaultCurrency: z.enum(["GHS", "USD"]),
  termsDays: z.coerce.number().int().min(0).max(365),
  paymentInstructions: z.string().trim().min(1).max(200),
  closingNote: z.string().trim().min(1).max(200),
  autoIssue: z.string().optional(),
});

export async function updateInvoiceSettings(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Not signed in." };
  const parsed = invoiceSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await saveInvoiceSettings({
      ...parsed.data,
      termsDays: String(parsed.data.termsDays),
      autoIssue: parsed.data.autoIssue === "on" ? "1" : "0",
    });
  } catch {
    return { ok: false, message: "Could not save invoice settings. Check your connection." };
  }
  revalidatePath("/admin/settings");
  await logAudit({
    actor: current,
    action: "settings.invoice_updated",
    targetType: "settings",
    summary: `Updated invoice settings (prefix ${parsed.data.invoicePrefix}, ${parsed.data.defaultCurrency}, ${parsed.data.termsDays}-day terms, auto-issue ${parsed.data.autoIssue === "on" ? "on" : "off"}).`,
  });
  return { ok: true, message: "Invoice settings saved." };
}

/* ---------------- Report template settings ---------------- */

const reportSettingsSchema = z.object({
  coqPrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers, and dashes only."),
  headerTagline: z.string().trim().min(1).max(60),
  certifyingStatement: z.string().trim().min(1).max(220),
});

export async function updateReportSettings(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Not signed in." };
  const parsed = reportSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  try {
    await saveReportSettings(parsed.data);
  } catch {
    return { ok: false, message: "Could not save report template settings. Check your connection." };
  }
  revalidatePath("/admin/settings");
  await logAudit({
    actor: current,
    action: "settings.report_template_updated",
    targetType: "settings",
    summary: `Updated report template (prefix ${parsed.data.coqPrefix}).`,
  });
  return { ok: true, message: "Report template saved." };
}

/* ---------------- Assignment & approval automation ---------------- */

const automationSchema = z.object({
  autoAssign: z.string().optional(),
  reassignHours: z.coerce.number().int().min(1).max(168),
  approvalMode: z.enum(["off", "shadow", "auto"]),
  approvalHoldHours: z.coerce.number().int().min(0).max(168),
  approvalMinCleanJobs: z.coerce.number().int().min(1).max(50),
  approvalRequireReport: z.string().optional(),
});

export async function updateAutomationSettings(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Not signed in." };
  const parsed = automationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the numbers entered." };
  const allowed = formData
    .getAll("approvalServiceTypes")
    .map(String)
    .filter((s): s is (typeof SERVICE_TYPES)[number] => (SERVICE_TYPES as readonly string[]).includes(s));
  if (parsed.data.approvalMode === "auto" && allowed.length === 0) {
    return { ok: false, message: "Pick at least one service type before turning on automatic approval." };
  }
  try {
    await saveAutomationSettings({
      autoAssign: parsed.data.autoAssign === "on" ? "1" : "0",
      reassignHours: String(parsed.data.reassignHours),
      approvalMode: parsed.data.approvalMode,
      approvalHoldHours: String(parsed.data.approvalHoldHours),
      approvalMinCleanJobs: String(parsed.data.approvalMinCleanJobs),
      approvalServiceTypes: allowed.join(","),
      approvalRequireReport: parsed.data.approvalRequireReport === "on" ? "1" : "0",
    });
  } catch {
    return { ok: false, message: "Could not save. Check your connection." };
  }
  revalidatePath("/admin/settings");
  await logAudit({
    actor: current,
    action: "settings.automation_updated",
    targetType: "settings",
    summary: `Updated automation: auto-assign ${parsed.data.autoAssign === "on" ? "on" : "off"}, approval ${parsed.data.approvalMode}, ${allowed.length} service type(s) allowed.`,
  });
  return { ok: true, message: "Automation settings saved." };
}
