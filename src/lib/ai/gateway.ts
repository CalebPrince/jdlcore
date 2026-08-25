import "server-only";
import {
  getAiSettings,
  type AiSettings,
  type ProviderName,
} from "./settings";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export class AiUnavailableError extends Error {
  failures: string[];
  constructor(failures: string[]) {
    super(`All AI providers failed: ${failures.join(" | ")}`);
    this.name = "AiUnavailableError";
    this.failures = failures;
  }
}

const MIN_PROVIDER_TIMEOUT_MS = 8_000;
const CONNECT_TIMEOUT_MS = 6_000;

type CallOpts = {
  key: string;
  system: string;
  turns: ChatTurn[];
  maxTokens: number;
  timeoutMs: number;
  model: string;
};

type Leg = {
  name: ProviderName;
  key: string;
  model: string;
  call: (opts: CallOpts) => Promise<string>;
};

function buildLegs(s: AiSettings): Leg[] {
  const legs: Leg[] = [];
  if (s.geminiEnabled && s.geminiKey)
    legs.push({ name: "gemini", key: s.geminiKey, model: s.geminiModel, call: callGemini });
  if (s.anthropicEnabled && s.anthropicKey)
    legs.push({ name: "anthropic", key: s.anthropicKey, model: s.anthropicModel, call: callAnthropic });
  if (s.groqEnabled && s.groqKey)
    legs.push({ name: "groq", key: s.groqKey, model: s.groqModel, call: callGroq });
  return legs;
}

/**
 * Run a completion, trying each configured provider in order (Gemini -> Anthropic -> Groq).
 * The total timeout is a shared budget across the whole chain so worst-case latency stays bounded.
 * Empty responses and truncated replies are treated as failures so we fall through to the next provider.
 */
export async function runCompletion(opts: {
  system: string;
  turns: ChatTurn[];
  maxTokens?: number;
  totalTimeoutMs?: number;
}): Promise<{ text: string; provider: ProviderName }> {
  const settings = await getAiSettings();
  const legs = buildLegs(settings);
  if (legs.length === 0) throw new AiUnavailableError(["No AI providers configured"]);

  const totalTimeoutMs = opts.totalTimeoutMs ?? 30_000;
  const maxTokens = opts.maxTokens ?? 700;
  const perCall = Math.max(MIN_PROVIDER_TIMEOUT_MS, Math.floor(totalTimeoutMs / legs.length));
  const deadline = Date.now() + totalTimeoutMs;

  const failures: string[] = [];
  for (const leg of legs) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_PROVIDER_TIMEOUT_MS) {
      failures.push(`${leg.name}: out of time budget`);
      break;
    }
    try {
      const text = await leg.call({
        key: leg.key,
        system: opts.system,
        turns: opts.turns,
        maxTokens,
        timeoutMs: Math.min(perCall, remaining),
        model: leg.model,
      });
      if (text && text.trim()) return { text: text.trim(), provider: leg.name };
      failures.push(`${leg.name}: empty response`);
    } catch (err) {
      failures.push(`${leg.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new AiUnavailableError(failures);
}

async function fetchJson(url: string, init: RequestInit, connectTimeoutMs = CONNECT_TIMEOUT_MS): Promise<unknown> {
  // Abort the request at the shorter of connect probe or full timeout via a two-stage controller.
  const controller = new AbortController();
  const connectTimer = setTimeout(() => controller.abort(new Error("connection timed out")), connectTimeoutMs);
  const res = await fetch(url, { ...init, signal: controller.signal });
  clearTimeout(connectTimer);
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) detail += ` ${body.error.message}`.slice(0, 200);
    } catch {
      /* ignore body parse issues */
    }
    throw new Error(detail);
  }
  return res.json();
}

function withHardTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function callGemini(opts: CallOpts): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents: opts.turns.map((t) => ({
      role: t.role === "assistant" ? "model" : "user",
      parts: [{ text: t.content }],
    })),
    generationConfig: { maxOutputTokens: opts.maxTokens, temperature: 0.4 },
  };
  const json = (await withHardTimeout(
    fetchJson(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": opts.key },
      body: JSON.stringify(body),
    }),
    opts.timeoutMs,
    "Gemini",
  )) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) throw new Error(`blocked (${json.promptFeedback.blockReason})`);
  const candidate = json.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error(`empty candidate${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}`);
  }
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(`finishReason ${candidate.finishReason}`);
  }
  return text;
}

async function callAnthropic(opts: CallOpts): Promise<string> {
  const json = (await withHardTimeout(
    fetchJson("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        temperature: 0.4,
        system: opts.system,
        messages: opts.turns.map((t) => ({ role: t.role, content: t.content })),
      }),
    }),
    opts.timeoutMs,
    "Anthropic",
  )) as { content?: { type: string; text?: string }[]; stop_reason?: string };

  const text = (json.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
  if (!text.trim()) throw new Error("empty response");
  if (json.stop_reason === "max_tokens") throw new Error("truncated (max_tokens)");
  return text;
}

async function callGroq(opts: CallOpts): Promise<string> {
  const json = (await withHardTimeout(
    fetchJson("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${opts.key}` },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        temperature: 0.4,
        messages: [
          { role: "system", content: opts.system },
          ...opts.turns.map((t) => ({ role: t.role, content: t.content })),
        ],
      }),
    }),
    opts.timeoutMs,
    "Groq",
  )) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };

  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (!text.trim()) throw new Error("empty response");
  if (choice?.finish_reason === "length") throw new Error("truncated (length)");
  return text;
}
