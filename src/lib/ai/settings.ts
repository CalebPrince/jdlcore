import "server-only";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const PROVIDER_ORDER = ["gemini", "anthropic", "groq"] as const;
export type ProviderName = (typeof PROVIDER_ORDER)[number];

export const PROVIDER_LABELS: Record<ProviderName, string> = {
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
  groq: "Groq",
};

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: "gemini-flash-latest",
  anthropic: "claude-sonnet-4-5",
  groq: "openai/gpt-oss-120b",
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
  chatPersona: string;
};

const ENV_KEYS: Record<ProviderName, string> = {
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  groq: "GROQ_API_KEY",
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
  chatPersona: "chat_persona",
} as const;

export const DEFAULT_PERSONA = `You are the assistant for the JDL Core website. JDL Core is a Ghana-based company with three divisions: JDL Core Inspection Services (property and vehicle inspections), JDL Core Analytics (data analytics, in development), and JDL Core Academy (training, in development). Be warm, concise and honest. Never invent prices, dates or statistics. If someone wants a quote, inspection or has a detailed request, point them to the Request an Inspection form or the WhatsApp contact line. If you do not know something, say so.`;

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
