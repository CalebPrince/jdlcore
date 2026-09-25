"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaffRole } from "@/lib/staff-auth";
import { saveAiSettingsValues } from "@/lib/ai/settings";
import { logAudit } from "@/lib/audit";
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
  openaiEnabled: z.string(),
  openaiModel: z.string().max(120),
  openaiKey: z.string().max(400),
  clearOpenaiKey: z.optional(z.string()),
  openrouterEnabled: z.string(),
  openrouterModel: z.string().max(120),
  openrouterKey: z.string().max(400),
  clearOpenrouterKey: z.optional(z.string()),
  deepseekEnabled: z.string(),
  deepseekModel: z.string().max(120),
  deepseekKey: z.string().max(400),
  clearDeepseekKey: z.optional(z.string()),
  chatPersona: z.string().max(4000),
});

export async function saveAiSettings(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const current = await requireStaffRole(["superadmin"]);
  if (!current) return { ok: false, message: "Unauthorized" };

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
      openaiEnabled: f.openaiEnabled === "on",
      openaiModel: f.openaiModel,
      openaiKey: f.openaiKey,
      clearOpenaiKey: f.clearOpenaiKey === "on",
      openrouterEnabled: f.openrouterEnabled === "on",
      openrouterModel: f.openrouterModel,
      openrouterKey: f.openrouterKey,
      clearOpenrouterKey: f.clearOpenrouterKey === "on",
      deepseekEnabled: f.deepseekEnabled === "on",
      deepseekModel: f.deepseekModel,
      deepseekKey: f.deepseekKey,
      clearDeepseekKey: f.clearDeepseekKey === "on",
      chatPersona: f.chatPersona,
    });
  } catch (err) {
    console.error("saveAiSettings failed:", err);
    return { ok: false, message: "Could not save AI settings. Check the database connection." };
  }

  revalidatePath("/admin/ai");
  const touchedKeys = [
    f.geminiKey || f.clearGeminiKey === "on" ? "Gemini" : null,
    f.anthropicKey || f.clearAnthropicKey === "on" ? "Anthropic" : null,
    f.groqKey || f.clearGroqKey === "on" ? "Groq" : null,
    f.openaiKey || f.clearOpenaiKey === "on" ? "OpenAI" : null,
    f.openrouterKey || f.clearOpenrouterKey === "on" ? "OpenRouter" : null,
    f.deepseekKey || f.clearDeepseekKey === "on" ? "DeepSeek" : null,
  ].filter(Boolean);
  await logAudit({
    actor: current,
    action: "settings.ai_updated",
    targetType: "settings",
    summary:
      touchedKeys.length > 0
        ? `Updated AI settings — key changed for: ${touchedKeys.join(", ")}.`
        : "Updated AI settings (models/persona, no keys changed).",
  });
  return { ok: true, message: "AI settings saved." };
}
