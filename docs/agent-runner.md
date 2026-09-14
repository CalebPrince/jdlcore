# Bounded agent runner

Roadmap step 4 ("Build a bounded agent runner"). Extends the provider gateway with structured tool calls, a bounded execution loop with persisted runs/steps, and step/time/token limits — and wires it into the existing Admin Operations Assistant (step 3) as an optional "agent mode."

## Why this is separate from `runCompletion`

`src/lib/ai/gateway.ts` already had `runCompletion()` for plain chat (public site, Analytics, and the Admin Operations Assistant's lookup mode). Rather than bolt tool-calling onto that function and its `ChatTurn` type, this adds a parallel `runAgentStep()` with its own `AgentTurn`/`ToolDefinition`/`ToolCall` types. That keeps every already-shipped feature's request shape untouched — a bug in the new tool-calling code cannot change what `runCompletion()` sends.

## Per-provider tool-calling formats

Each provider has its own wire format for tools, and `runAgentStep()` maps the abstract `AgentTurn[]`/`ToolDefinition[]` to each independently, mirroring how the existing `callGemini`/`callAnthropic`/`callGroq` already independently build their own request shape from `ChatTurn[]`:

- **Anthropic** (`callAnthropicAgent`): `tools: [{name, description, input_schema}]`; an assistant turn with tool calls becomes `content: [{type:"text",...}, {type:"tool_use", id, name, input}, ...]`; a tool result becomes a `user` turn with `content: [{type:"tool_result", tool_use_id, content}]`. `stop_reason: "max_tokens"` is treated as a failure even if some tool calls came through, since a truncated call's arguments cannot be trusted.
- **Gemini** (`callGeminiAgent`): `tools: [{functionDeclarations: [{name, description, parameters}]}]`; a function call comes back as a `functionCall` part with no id, so one is synthesised (`gemini-<timestamp>-<index>`); a tool result is sent back as a `{role: "function", parts: [{functionResponse: {name, response}}]}` turn, per Gemini's documented REST convention.
- **Groq** (`callGroqAgent`, OpenAI-compatible): `tools: [{type:"function", function:{name, description, parameters}}]`; tool calls come back as `message.tool_calls[].function.arguments`, a JSON string that is parsed defensively (a malformed string yields empty arguments rather than failing the whole step); a tool result is a `{role:"tool", tool_call_id, content}` turn.

None of this has been exercised against a live API from this codebase — the mapping is written from each provider's published documentation. That is exactly why enabling it is gated (next section) rather than automatic.

## The validated-provider gate

A provider being enabled and keyed for plain chat does **not** automatically make it usable for agent runs. `src/lib/ai/settings.ts` adds a separate `${provider}AgentToolsValidated` flag per provider (Admin > AI Settings > "Validated for agent tool calls"), **off by default for all three**. `buildAgentLegs()` in `gateway.ts` only includes a provider once its flag is on. This is the literal roadmap instruction ("validate provider tool support before enabling failover for agent runs") implemented as a real switch an administrator must flip after confirming a provider's tool-calling actually works end-to-end against this app — not an assumption baked into the code.

Practically: ship this code, and agent mode stays off (falling back to the step-3 lookup mode) until someone deliberately turns a provider on.

## The bounded loop

`src/lib/ai/agent-runner.ts`'s `runBoundedAgent()`:

1. Inserts an `agent_runs` row (`staffId`, `goal`, `status: "running"`).
2. Loops: call `runAgentStep()` with the accumulated turns; persist an `agent_steps` row for the assistant's turn (text, tool calls, provider, token usage); if there are no tool calls, that's the final answer — stop with `status: "completed"`.
3. Otherwise, run each requested tool call through the caller-supplied `executeTool`, persist an `agent_steps` row per tool result, and feed the result back as a `tool` turn for the next step.
4. Enforces three limits, checked every iteration:
   - **Step limit** (`maxSteps`, default 6) — counts model turns, not tool calls; a turn that requests three tool calls still only counts once.
   - **Wall-clock limit** (`maxWallClockMs`, default 45s) — checked before starting a new step; a step already in flight is not aborted mid-call.
   - **Token budget** (`maxTotalTokens`, default 20,000, summing input+output tokens across the run) — this app has no metered per-token billing wired in anywhere, so token count is used as the closest available proxy for a "spending" limit, not an actual currency figure.
5. Whichever limit is hit first, or a provider failure, updates the `agent_runs` row with `status`/`stopReason`/`totalSteps`/token totals and `completedAt`. A run that fails entirely (every validated provider erroring) is marked `status: "failed"`, `stopReason: "error"` rather than throwing — the caller (the assistant API route) treats that as a signal to fall back to lookup mode, not a hard error to the user.

Every step is persisted as it happens, not just the final answer — a run that hits a limit or crashes mid-way still leaves a complete, queryable record in `agent_runs`/`agent_steps`. There is no dedicated viewer page for these tables yet; querying them directly (or building one) is a natural next increment, not something this change includes.

## Global `[Ref n]` numbering

The agent's tools are the same four read-only lookups from `src/lib/ai/admin-assistant-tools.ts` used by the step-3 lookup mode (`src/lib/ai/agent-tools.ts` wraps them as `ToolDefinition`s and dispatches `ToolCall`s to them). A run can call several tools across several steps, and the model must cite evidence by `[Ref n]`. Ref numbers are **not** reset per tool call — `runBoundedAgent()` keeps one running `allEvidence` array for the whole run and numbers each new item by its position in that array, so two different tool calls never end up both claiming `[Ref 1]`.

## Still read-only

The only tools available are the four read lookups — nothing here can write to any table, approve anything, or send a notification. That is deliberate: the roadmap orders "reviewed actions" (step 5, letting an agent prepare a write for a human to approve) after the bounded runner, and this change stays within that boundary.

## Wired into the Admin Operations Assistant

`src/app/api/admin/assistant/route.ts` tries agent mode first (`tryAgentMode()`): if any provider is validated, it runs `runBoundedAgent()` with `buildAdminAgentSystemPrompt()` (a tools-aware system prompt with no pre-gathered evidence, unlike the lookup-mode prompt) and the four wrapped tools. If no provider is validated, or the run's `status` comes back `"failed"`, it falls back to the existing step-3 keyword-routed lookup transparently — the same conversation, the same evidence-citation UI, just a different engine underneath. The JSON response includes `mode: "agent" | "lookup"` so this is inspectable from the client if needed.

**Known simplification:** each chat message currently starts a brand-new agent run seeded with just that message (`goal: message`) — prior turns in the same conversation are not threaded into the tool-calling loop's turns. Multi-turn context for a genuinely stateful tool-calling conversation is real complexity (assistant turns from a previous run would need their tool-call/tool-result structure preserved, not just flattened to text) and is deferred rather than done partially. The plain conversation history (user/assistant text) still persists and displays normally in `admin_assistant_messages`, same as lookup mode.

## Storage

Two new tables: `agent_runs` (one row per run: goal, status, stop reason, step/token totals, timestamps) and `agent_steps` (one row per assistant turn or tool result: role, content, tool calls, tool name/id, provider, token usage). Migration: `npm run db:migrate:agent-runner` (or `npm run db:push`, which picks up the new tables from `src/db/schema.ts` directly).

## Validation

`node scripts/test-agent-runner.cjs` covers: per-provider tool-call request/response mapping for Gemini, Anthropic, and Groq (including a full round trip of a tool call and its fed-back result) against a stubbed `fetch`; that an enabled-but-unvalidated provider is never used for agent runs; empty and truncated tool responses failing rather than returning partial/untrustworthy data; failover across providers within a single step; the `AgentToolsValidated` setting defaulting off per provider and round-tripping independently per provider; the tool dispatcher rejecting unknown tool names and invalid arguments (e.g. an out-of-enum severity); and the bounded runner's natural completion, step-limit cutoff, token-budget cutoff, tool-execution-error handling (fed back to the model rather than crashing the run), total-provider-failure handling, and global ref-numbering — all against a fully in-memory fake database, following the same test-script convention as `scripts/test-platform-knowledge.cjs` and `scripts/test-admin-assistant.cjs`.

Not yet live-verified against a real provider, since no provider is validated in any deployed environment — that is the deliberate first step for whoever operates this: pick one provider, flip its switch, and exercise the Admin Operations Assistant in agent mode before relying on it.
