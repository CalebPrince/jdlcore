"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth";
import { saveAiSettingsValues } from "@/lib/ai/settings";
import type { FormState } from "./submissions";

const schema = z.object({
  geminiEnabled: z.string(),
  geminiModel: z.string().max(120),
  geminiKey: z.string().max(400),
  clearGeminiKey: z.optional(z.string()),
  anthropicEnabled: z.string(),
  anthropicModel: z.string().max(120),
  anthropicKey: z.string().max(400),
  clearAnthropicKey: z.optional(z.string()),
  groqEnabled: z.string(),
  groqModel: z.string().max(120),
  groqKey: z.string().max(400),
  clearGroqKey: z.optional(z.string()),
  chatPersona: z.string().max(4000),
});

export async function saveAiSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  if (!(await isAuthenticated())) return { ok: false, message: "Unauthorized" };

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "Please check the values and try again." };
  }
  const f = parsed.data;

  try {
    await saveAiSettingsValues({
      geminiEnabled: f.geminiEnabled === "on",
      geminiModel: f.geminiModel,
      geminiKey: f.geminiKey,
      clearGeminiKey: f.clearGeminiKey === "on",
      anthropicEnabled: f.anthropicEnabled === "on",
      anthropicModel: f.anthropicModel,
      anthropicKey: f.anthropicKey,
      clearAnthropicKey: f.clearAnthropicKey === "on",
      groqEnabled: f.groqEnabled === "on",
      groqModel: f.groqModel,
      groqKey: f.groqKey,
      clearGroqKey: f.clearGroqKey === "on",
      chatPersona: f.chatPersona,
    });
  } catch (err) {
    console.error("saveAiSettings failed:", err);
    return { ok: false, message: "Could not save AI settings. Check the database connection." };
  }

  revalidatePath("/admin/ai");
  return { ok: true, message: "AI settings saved." };
}
