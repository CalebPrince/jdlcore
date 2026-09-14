import "server-only";
import {
  getAiSettings,
  type AiSettings,
  type ProviderName,
} from "./settings";

export type ChatTurn = { role: "user" | "assistant"; content: string };
export type Attachment = { mimeType: string; base64: string };

/** A JSON Schema object describing a tool's arguments, as sent to each provider. */
export type ToolParameterSchema = Record<string, unknown>;
export type ToolDefinition = { name: string; description: string; parameters: ToolParameterSchema };
export type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };

/**
 * Turns for a bounded tool-calling agent step. Deliberately separate from
 * ChatTurn (used by the plain chat/analytics/admin-lookup assistants) so
 * extending tool-calling here can never change the request shape those
 * simpler, already-shipped features send.
 */
export type AgentTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type AgentStepResult = {
  provider: ProviderName;
  text: string;
  toolCalls: ToolCall[];
  usage: { inputTokens: number; outputTokens: number } | null;
};

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
  attachment?: Attachment;
  temperature: number;
};

type Leg = {
  name: ProviderName;
  key: string;
  model: string;
  call: (opts: CallOpts) => Promise<string>;
};

function buildLegs(s: AiSettings, hasAttachment: boolean): Leg[] {
  const legs: Leg[] = [];
  if (s.geminiEnabled && s.geminiKey)
    legs.push({ name: "gemini", key: s.geminiKey, model: s.geminiModel, call: callGemini });
  if (s.anthropicEnabled && s.anthropicKey)
    legs.push({ name: "anthropic", key: s.anthropicKey, model: s.anthropicModel, call: callAnthropic });
  // Groq's configured models here are text-only — skip it for attachment (vision/document) calls.
  if (!hasAttachment && s.groqEnabled && s.groqKey)
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
  attachment?: Attachment;
  temperature?: number;
}): Promise<{ text: string; provider: ProviderName }> {
  const settings = await getAiSettings();
  const legs = buildLegs(settings, !!opts.attachment);
  if (legs.length === 0) {
    throw new AiUnavailableError([
      opts.attachment ? "No vision-capable AI providers configured" : "No AI providers configured",
    ]);
  }

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
        attachment: opts.attachment,
        temperature: opts.temperature ?? 0.4,
      });
      if (text && text.trim()) return { text: text.trim(), provider: leg.name };
      failures.push(`${leg.name}: empty response`);
    } catch (err) {
      failures.push(`${leg.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new AiUnavailableError(failures);
}

type AgentCallOpts = {
  key: string;
  system: string;
  turns: AgentTurn[];
  tools: ToolDefinition[];
  maxTokens: number;
  timeoutMs: number;
  model: string;
  temperature: number;
};

type AgentLeg = {
  name: ProviderName;
  key: string;
  model: string;
  call: (opts: AgentCallOpts) => Promise<{ text: string; toolCalls: ToolCall[]; usage: AgentStepResult["usage"] }>;
};

/**
 * Only providers an administrator has explicitly marked as validated for
 * tool calling (Admin > AI Settings) are used for agent runs — this is a
 * distinct, narrower gate from the plain-chat failover chain in buildLegs(),
 * since each provider's tool-calling request/response shape is mapped by
 * hand below and untested against a live API until someone confirms it works.
 */
function buildAgentLegs(s: AiSettings): AgentLeg[] {
  const legs: AgentLeg[] = [];
  if (s.geminiEnabled && s.geminiKey && s.geminiAgentToolsValidated)
    legs.push({ name: "gemini", key: s.geminiKey, model: s.geminiModel, call: callGeminiAgent });
  if (s.anthropicEnabled && s.anthropicKey && s.anthropicAgentToolsValidated)
    legs.push({ name: "anthropic", key: s.anthropicKey, model: s.anthropicModel, call: callAnthropicAgent });
  if (s.groqEnabled && s.groqKey && s.groqAgentToolsValidated)
    legs.push({ name: "groq", key: s.groqKey, model: s.groqModel, call: callGroqAgent });
  return legs;
}

/**
 * One step of a bounded tool-calling agent loop: send the accumulated turns
 * and available tools, get back either a final text answer or a batch of
 * tool calls for the caller to execute and feed back as `tool` turns on the
 * next step. Failover behaves like runCompletion, but only across legs an
 * administrator has validated for tool calling (see buildAgentLegs).
 */
export async function runAgentStep(opts: {
  system: string;
  turns: AgentTurn[];
  tools: ToolDefinition[];
  maxTokens?: number;
  totalTimeoutMs?: number;
  temperature?: number;
}): Promise<AgentStepResult> {
  const settings = await getAiSettings();
  const legs = buildAgentLegs(settings);
  if (legs.length === 0) {
    throw new AiUnavailableError(["No AI providers validated for agent tool calls"]);
  }

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
      const result = await leg.call({
        key: leg.key,
        system: opts.system,
        turns: opts.turns,
        tools: opts.tools,
        maxTokens,
        timeoutMs: Math.min(perCall, remaining),
        model: leg.model,
        temperature: opts.temperature ?? 0.2,
      });
      if ((result.text && result.text.trim()) || result.toolCalls.length > 0) {
        return { provider: leg.name, text: result.text.trim(), toolCalls: result.toolCalls, usage: result.usage };
      }
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
  const contents = opts.turns.map((t, i) => {
    const parts: Record<string, unknown>[] = [{ text: t.content }];
    if (opts.attachment && t.role === "user" && i === opts.turns.length - 1) {
      parts.push({ inline_data: { mime_type: opts.attachment.mimeType, data: opts.attachment.base64 } });
    }
    return { role: t.role === "assistant" ? "model" : "user", parts };
  });
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents,
    generationConfig: { maxOutputTokens: opts.maxTokens, temperature: opts.temperature },
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
  const messages = opts.turns.map((t, i) => {
    if (opts.attachment && t.role === "user" && i === opts.turns.length - 1) {
      const isPdf = opts.attachment.mimeType === "application/pdf";
      const fileBlock = isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: opts.attachment.base64 } }
        : { type: "image", source: { type: "base64", media_type: opts.attachment.mimeType, data: opts.attachment.base64 } };
      return { role: t.role, content: [{ type: "text", text: t.content }, fileBlock] };
    }
    return { role: t.role, content: t.content };
  });
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
        temperature: opts.temperature,
        system: opts.system,
        messages,
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
        temperature: opts.temperature,
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

// ---------------------------------------------------------------------------
// Agent tool-calling per provider. Each function independently builds its
// provider's wire format from the abstract AgentTurn[]/ToolDefinition[] and
// parses the response back to { text, toolCalls, usage } — mirroring how
// callGemini/callAnthropic/callGroq above independently handle ChatTurn[].
// These have not been exercised against a live API; buildAgentLegs() only
// includes a provider once an administrator flips its "validated" switch.
// ---------------------------------------------------------------------------

async function callGeminiAgent(opts: AgentCallOpts): ReturnType<AgentLeg["call"]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const contents = opts.turns.map((t) => {
    if (t.role === "user") return { role: "user", parts: [{ text: t.content }] };
    if (t.role === "tool") {
      return { role: "function", parts: [{ functionResponse: { name: t.name, response: { content: t.content } } }] };
    }
    const parts: Record<string, unknown>[] = [];
    if (t.content) parts.push({ text: t.content });
    for (const call of t.toolCalls ?? []) parts.push({ functionCall: { name: call.name, args: call.arguments } });
    return { role: "model", parts };
  });
  const body = {
    systemInstruction: { parts: [{ text: opts.system }] },
    contents,
    tools: opts.tools.length
      ? [{ functionDeclarations: opts.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }]
      : undefined,
    generationConfig: { maxOutputTokens: opts.maxTokens, temperature: opts.temperature },
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
    candidates?: {
      content?: { parts?: { text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }[] };
      finishReason?: string;
    }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    promptFeedback?: { blockReason?: string };
  };

  if (json.promptFeedback?.blockReason) throw new Error(`blocked (${json.promptFeedback.blockReason})`);
  const candidate = json.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");
  const toolCalls: ToolCall[] = parts
    .filter((p): p is { functionCall: { name: string; args?: Record<string, unknown> } } => !!p.functionCall)
    .map((p, i) => ({ id: `gemini-${Date.now()}-${i}`, name: p.functionCall.name, arguments: p.functionCall.args ?? {} }));

  if (!text.trim() && toolCalls.length === 0) {
    throw new Error(`empty candidate${candidate?.finishReason ? ` (${candidate.finishReason})` : ""}`);
  }
  if (candidate?.finishReason === "MAX_TOKENS") throw new Error("truncated (MAX_TOKENS)");
  return {
    text,
    toolCalls,
    usage: json.usageMetadata
      ? { inputTokens: json.usageMetadata.promptTokenCount ?? 0, outputTokens: json.usageMetadata.candidatesTokenCount ?? 0 }
      : null,
  };
}

async function callAnthropicAgent(opts: AgentCallOpts): ReturnType<AgentLeg["call"]> {
  const messages = opts.turns.map((t) => {
    if (t.role === "user") return { role: "user", content: t.content };
    if (t.role === "tool") {
      return { role: "user", content: [{ type: "tool_result", tool_use_id: t.toolCallId, content: t.content }] };
    }
    const content: Record<string, unknown>[] = [];
    if (t.content) content.push({ type: "text", text: t.content });
    for (const call of t.toolCalls ?? []) content.push({ type: "tool_use", id: call.id, name: call.name, input: call.arguments });
    return { role: "assistant", content };
  });
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
        temperature: opts.temperature,
        system: opts.system,
        messages,
        tools: opts.tools.length
          ? opts.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }))
          : undefined,
      }),
    }),
    opts.timeoutMs,
    "Anthropic",
  )) as {
    content?: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const blocks = json.content ?? [];
  const text = blocks.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  const toolCalls: ToolCall[] = blocks
    .filter((c) => c.type === "tool_use")
    .map((c) => ({ id: c.id ?? `anthropic-${Date.now()}`, name: c.name ?? "", arguments: c.input ?? {} }));

  if (!text.trim() && toolCalls.length === 0) throw new Error("empty response");
  if (json.stop_reason === "max_tokens") throw new Error("truncated (max_tokens)");
  return {
    text,
    toolCalls,
    usage: json.usage ? { inputTokens: json.usage.input_tokens ?? 0, outputTokens: json.usage.output_tokens ?? 0 } : null,
  };
}

async function callGroqAgent(opts: AgentCallOpts): ReturnType<AgentLeg["call"]> {
  const messages = opts.turns.map((t) => {
    if (t.role === "user") return { role: "user", content: t.content };
    if (t.role === "tool") return { role: "tool", tool_call_id: t.toolCallId, content: t.content };
    return {
      role: "assistant",
      content: t.content || null,
      tool_calls: t.toolCalls?.length
        ? t.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } }))
        : undefined,
    };
  });
  const json = (await withHardTimeout(
    fetchJson("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${opts.key}` },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        messages: [{ role: "system", content: opts.system }, ...messages],
        tools: opts.tools.length
          ? opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }))
          : undefined,
      }),
    }),
    opts.timeoutMs,
    "Groq",
  )) as {
    choices?: {
      message?: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] };
      finish_reason?: string;
    }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? "";
  const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((c) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(c.function.arguments);
    } catch {
      // Leave args empty rather than fail the whole step over one malformed call.
    }
    return { id: c.id, name: c.function.name, arguments: args };
  });

  if (!text.trim() && toolCalls.length === 0) throw new Error("empty response");
  if (choice?.finish_reason === "length") throw new Error("truncated (length)");
  return {
    text,
    toolCalls,
    usage: json.usage ? { inputTokens: json.usage.prompt_tokens ?? 0, outputTokens: json.usage.completion_tokens ?? 0 } : null,
  };
}
