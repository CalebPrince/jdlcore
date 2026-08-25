"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  checkPassword,
  createSession,
  destroySession,
  isAuthenticated,
} from "@/lib/auth";
import {
  DEFAULT_SETTINGS,
  saveContactSettings,
} from "@/lib/settings";

export type AdminState = { ok: boolean; message: string };

const loginSchema = z.object({
  password: z.string().min(1, "Enter the admin password."),
});

export async function login(
  _prev: AdminState,
  formData: FormData
): Promise<AdminState> {
  const parsed = loginSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success || !checkPassword(parsed.data.password)) {
    return { ok: false, message: "Incorrect password." };
  }
  await createSession();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/admin/login");
}

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
  if (!(await isAuthenticated())) {
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
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error && err.message.includes("DATABASE_URL")
          ? "DATABASE_URL is not set — connect Supabase first (see README)."
          : "Could not save to the database. Check your connection.",
    };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Contact details saved and live on the site." };
}

function normalizePhoneHref(input: FormDataEntryValue | null): string {
  const raw = String(input ?? "").trim();
  if (!raw) return DEFAULT_SETTINGS.phoneHref;
  if (/^tel:/i.test(raw)) return raw;
  return `tel:${raw.replace(/[\s()-]/g, "")}`;
}
