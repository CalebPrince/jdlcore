import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const PROVIDER_ORDER = [
  "gemini",
  "anthropic",
  "groq",
  "openai",
  "openrouter",
  "deepseek",
] as const;
export type ProviderName = (typeof PROVIDER_ORDER)[number];

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
  groq: "Groq",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  deepseek: "DeepSeek",
};

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: "gemini-flash-latest",
  anthropic: "claude-sonnet-4-5",
  groq: "openai/gpt-oss-120b",
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  deepseek: "deepseek-chat",
};

export type AiSettings = {
  geminiKey: string | null;
  geminiModel: string;
  geminiEnabled: boolean;
  anthropicKey: string | null;
  anthropicModel: string;
  anthropicEnabled: boolean;
  groqKey: string | null;
  groqModel: string;
  groqEnabled: boolean;
  openaiKey: string | null;
  openaiModel: string;
  openaiEnabled: boolean;
  openrouterKey: string | null;
  openrouterModel: string;
  openrouterEnabled: boolean;
  deepseekKey: string | null;
  deepseekModel: string;
  deepseekEnabled: boolean;
  chatPersona: string;
};

const ENV_KEYS: Record<ProviderName, string> = {
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
};

const DB_KEYS = {
  geminiKey: "ai_gemini_key",
  geminiModel: "ai_gemini_model",
  geminiEnabled: "ai_gemini_enabled",
  anthropicKey: "ai_anthropic_key",
  anthropicModel: "ai_anthropic_model",
  anthropicEnabled: "ai_anthropic_enabled",
  groqKey: "ai_groq_key",
  groqModel: "ai_groq_model",
  groqEnabled: "ai_groq_enabled",
  openaiKey: "ai_openai_key",
  openaiModel: "ai_openai_model",
  openaiEnabled: "ai_openai_enabled",
  openrouterKey: "ai_openrouter_key",
  openrouterModel: "ai_openrouter_model",
  openrouterEnabled: "ai_openrouter_enabled",
  deepseekKey: "ai_deepseek_key",
  deepseekModel: "ai_deepseek_model",
  deepseekEnabled: "ai_deepseek_enabled",
  chatPersona: "chat_persona",
} as const;

export const DEFAULT_PERSONA = `You are the assistant for the JDL Core website. Use the shared PLATFORM KNOWLEDGE for the company, its divisions, workflows, and capabilities. Be warm, concise and honest. Never invent prices, dates or statistics. If someone wants a quote, inspection or has a detailed request, point them to the Request an Inspection form or the WhatsApp contact line. If you do not know something, say so.`;

export async function getAiSettings(): Promise<AiSettings> {
  let rows: { key: string; value: string }[] = [];
  try {
    if (!db) throw new Error("db unavailable");
    rows = await db
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(
        inArray(settings.key, [
          DB_KEYS.geminiKey,
          DB_KEYS.geminiModel,
          DB_KEYS.geminiEnabled,
          DB_KEYS.anthropicKey,
          DB_KEYS.anthropicModel,
          DB_KEYS.anthropicEnabled,
          DB_KEYS.groqKey,
          DB_KEYS.groqModel,
          DB_KEYS.groqEnabled,
          DB_KEYS.openaiKey,
          DB_KEYS.openaiModel,
          DB_KEYS.openaiEnabled,
          DB_KEYS.openrouterKey,
          DB_KEYS.openrouterModel,
          DB_KEYS.openrouterEnabled,
          DB_KEYS.deepseekKey,
          DB_KEYS.deepseekModel,
          DB_KEYS.deepseekEnabled,
          DB_KEYS.chatPersona,
        ]),
      );
  } catch {
    return fallbackSettings();
  }
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return buildSettings(map);
}

function envOrNull(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function fallbackSettings(): AiSettings {
  return {
    geminiKey: envOrNull(ENV_KEYS.gemini),
    geminiModel: DEFAULT_MODELS.gemini,
    geminiEnabled: true,
    anthropicKey: envOrNull(ENV_KEYS.anthropic),
    anthropicModel: DEFAULT_MODELS.anthropic,
    anthropicEnabled: true,
    groqKey: envOrNull(ENV_KEYS.groq),
    groqModel: DEFAULT_MODELS.groq,
    groqEnabled: true,
    openaiKey: envOrNull(ENV_KEYS.openai),
    openaiModel: DEFAULT_MODELS.openai,
    openaiEnabled: true,
    openrouterKey: envOrNull(ENV_KEYS.openrouter),
    openrouterModel: DEFAULT_MODELS.openrouter,
    openrouterEnabled: true,
    deepseekKey: envOrNull(ENV_KEYS.deepseek),
    deepseekModel: DEFAULT_MODELS.deepseek,
    deepseekEnabled: true,
    chatPersona: "",
  };
}

function buildSettings(map: Map<string, string>): AiSettings {
  const dbOrEnv = (dbKey: string, provider: ProviderName): string | null => {
    const v = map.get(dbKey);
    if (v && v.trim()) return v.trim();
    return envOrNull(ENV_KEYS[provider]);
  };
  const model = (dbKey: string, provider: ProviderName): string => {
    const v = map.get(dbKey);
    return v && v.trim() ? v.trim() : DEFAULT_MODELS[provider];
  };
  const enabled = (dbKey: string): boolean => {
    // Default to enabled; only explicitly stored "0"/"false" disables.
    const v = map.get(dbKey);
    return v === undefined || !(v === "0" || v === "false");
  };
  const persona = map.get(DB_KEYS.chatPersona) ?? "";
  return {
    geminiKey: dbOrEnv(DB_KEYS.geminiKey, "gemini"),
    geminiModel: model(DB_KEYS.geminiModel, "gemini"),
    geminiEnabled: enabled(DB_KEYS.geminiEnabled),
    anthropicKey: dbOrEnv(DB_KEYS.anthropicKey, "anthropic"),
    anthropicModel: model(DB_KEYS.anthropicModel, "anthropic"),
    anthropicEnabled: enabled(DB_KEYS.anthropicEnabled),
    groqKey: dbOrEnv(DB_KEYS.groqKey, "groq"),
    groqModel: model(DB_KEYS.groqModel, "groq"),
    groqEnabled: enabled(DB_KEYS.groqEnabled),
    openaiKey: dbOrEnv(DB_KEYS.openaiKey, "openai"),
    openaiModel: model(DB_KEYS.openaiModel, "openai"),
    openaiEnabled: enabled(DB_KEYS.openaiEnabled),
    openrouterKey: dbOrEnv(DB_KEYS.openrouterKey, "openrouter"),
    openrouterModel: model(DB_KEYS.openrouterModel, "openrouter"),
    openrouterEnabled: enabled(DB_KEYS.openrouterEnabled),
    deepseekKey: dbOrEnv(DB_KEYS.deepseekKey, "deepseek"),
    deepseekModel: model(DB_KEYS.deepseekModel, "deepseek"),
    deepseekEnabled: enabled(DB_KEYS.deepseekEnabled),
    chatPersona: persona,
  };
}

/** Persist a set of AI settings. Empty/undefined key fields are skipped so existing keys survive partial saves. */
export async function saveAiSettingsValues(values: {
  geminiKey?: string | null;
  clearGeminiKey?: boolean;
  geminiModel?: string;
  geminiEnabled?: boolean;
  anthropicKey?: string | null;
  clearAnthropicKey?: boolean;
  anthropicModel?: string;
  anthropicEnabled?: boolean;
  groqKey?: string | null;
  clearGroqKey?: boolean;
  groqModel?: string;
  groqEnabled?: boolean;
  openaiKey?: string | null;
  clearOpenaiKey?: boolean;
  openaiModel?: string;
  openaiEnabled?: boolean;
  openrouterKey?: string | null;
  clearOpenrouterKey?: boolean;
  openrouterModel?: string;
  openrouterEnabled?: boolean;
  deepseekKey?: string | null;
  clearDeepseekKey?: boolean;
  deepseekModel?: string;
  deepseekEnabled?: boolean;
  chatPersona?: string;
}): Promise<void> {
  if (!db) throw new Error("Database not configured");
  const upserts: { key: string; value: string }[] = [];
  const push = (key: string, value: string) => upserts.push({ key, value });

  if (values.clearGeminiKey) push(DB_KEYS.geminiKey, "");
  else if (values.geminiKey?.trim()) push(DB_KEYS.geminiKey, values.geminiKey.trim());
  if (values.geminiModel !== undefined)
    push(DB_KEYS.geminiModel, values.geminiModel.trim() || DEFAULT_MODELS.gemini);
  if (values.geminiEnabled !== undefined)
    push(DB_KEYS.geminiEnabled, values.geminiEnabled ? "1" : "0");

  if (values.clearAnthropicKey) push(DB_KEYS.anthropicKey, "");
  else if (values.anthropicKey?.trim())
    push(DB_KEYS.anthropicKey, values.anthropicKey.trim());
  if (values.anthropicModel !== undefined)
    push(DB_KEYS.anthropicModel, values.anthropicModel.trim() || DEFAULT_MODELS.anthropic);
  if (values.anthropicEnabled !== undefined)
    push(DB_KEYS.anthropicEnabled, values.anthropicEnabled ? "1" : "0");

  if (values.clearGroqKey) push(DB_KEYS.groqKey, "");
  else if (values.groqKey?.trim()) push(DB_KEYS.groqKey, values.groqKey.trim());
  if (values.groqModel !== undefined)
    push(DB_KEYS.groqModel, values.groqModel.trim() || DEFAULT_MODELS.groq);
  if (values.groqEnabled !== undefined)
    push(DB_KEYS.groqEnabled, values.groqEnabled ? "1" : "0");

  if (values.clearOpenaiKey) push(DB_KEYS.openaiKey, "");
  else if (values.openaiKey?.trim()) push(DB_KEYS.openaiKey, values.openaiKey.trim());
  if (values.openaiModel !== undefined)
    push(DB_KEYS.openaiModel, values.openaiModel.trim() || DEFAULT_MODELS.openai);
  if (values.openaiEnabled !== undefined)
    push(DB_KEYS.openaiEnabled, values.openaiEnabled ? "1" : "0");

  if (values.clearOpenrouterKey) push(DB_KEYS.openrouterKey, "");
  else if (values.openrouterKey?.trim()) push(DB_KEYS.openrouterKey, values.openrouterKey.trim());
  if (values.openrouterModel !== undefined)
    push(DB_KEYS.openrouterModel, values.openrouterModel.trim() || DEFAULT_MODELS.openrouter);
  if (values.openrouterEnabled !== undefined)
    push(DB_KEYS.openrouterEnabled, values.openrouterEnabled ? "1" : "0");

  if (values.clearDeepseekKey) push(DB_KEYS.deepseekKey, "");
  else if (values.deepseekKey?.trim()) push(DB_KEYS.deepseekKey, values.deepseekKey.trim());
  if (values.deepseekModel !== undefined)
    push(DB_KEYS.deepseekModel, values.deepseekModel.trim() || DEFAULT_MODELS.deepseek);
  if (values.deepseekEnabled !== undefined)
    push(DB_KEYS.deepseekEnabled, values.deepseekEnabled ? "1" : "0");

  if (values.chatPersona !== undefined)
    push(DB_KEYS.chatPersona, values.chatPersona);

  if (upserts.length > 0) {
    await db
      .insert(settings)
      .values(upserts)
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`excluded.value`, updatedAt: new Date() },
      });
  }
}

export async function isAiConfigured(): Promise<boolean> {
  const s = await getAiSettings();
  return PROVIDER_ORDER.some((p) => s[`${p}Enabled`] && s[`${p}Key`]);
}

export function maskKey(key: string | null): string | null {
  if (!key) return null;
  const tail = key.slice(-4);
  const head = key.slice(0, Math.min(3, Math.max(key.length - 4, 0)));
  return `${head}${"\u2022".repeat(6)}${tail}`;
}
