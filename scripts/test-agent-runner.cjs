const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');

function compileTs(relPath, requireOverride) {
  const file = path.resolve(__dirname, relPath);
  const mod = new Module(file, module);
  mod.filename = file;
  mod.paths = module.paths;
  mod.require = requireOverride || ((id) => require(id));
  const source = fs.readFileSync(file, 'utf8').replace(/^"use server";?\s*/, '');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  mod._compile(compiled, file);
  return mod.exports;
}

// ---------------------------------------------------------------------------
// Gateway: structured tool calls per provider, over a stubbed global fetch.
// ---------------------------------------------------------------------------

const realFetch = global.fetch;
let fetchCalls = [];
let fetchQueue = [];
global.fetch = async (url, init) => {
  fetchCalls.push({ url, init });
  const next = fetchQueue.shift();
  if (!next) throw new Error('test error: no canned fetch response queued');
  if (next.networkError) throw next.networkError;
  return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
};

function queueResponse(body, status = 200) {
  fetchQueue.push({ body, status });
}

let currentSettings;
function baseSettings(overrides) {
  return {
    geminiKey: null, geminiModel: 'gemini-flash-latest', geminiEnabled: false, geminiAgentToolsValidated: false,
    anthropicKey: null, anthropicModel: 'claude-sonnet-4-5', anthropicEnabled: false, anthropicAgentToolsValidated: false,
    groqKey: null, groqModel: 'openai/gpt-oss-120b', groqEnabled: false, groqAgentToolsValidated: false,
    chatPersona: '',
    ...overrides,
  };
}

const gateway = compileTs('../src/lib/ai/gateway.ts', (id) => {
  if (id === 'server-only') return {};
  if (id === './settings') return { getAiSettings: async () => currentSettings };
  return require(id);
});

const TOOLS = [{ name: 'search_jobs', description: 'find jobs', parameters: { type: 'object', properties: { query: { type: 'string' } } } }];

async function testNoValidatedProvider() {
  currentSettings = baseSettings({ anthropicKey: 'k', anthropicEnabled: true, anthropicAgentToolsValidated: false });
  await assert.rejects(
    () => gateway.runAgentStep({ system: 's', turns: [{ role: 'user', content: 'hi' }], tools: TOOLS }),
    (err) => err instanceof gateway.AiUnavailableError && err.failures.join(' ').includes('validated'),
  );
  console.log('Gateway checks passed: an unvalidated-but-configured provider is never used for agent runs.');
}

async function testAnthropicToolRoundTrip() {
  currentSettings = baseSettings({ anthropicKey: 'k', anthropicEnabled: true, anthropicAgentToolsValidated: true });
  fetchCalls = [];
  fetchQueue = [];
  queueResponse({
    content: [
      { type: 'text', text: 'Let me check.' },
      { type: 'tool_use', id: 'call_1', name: 'search_jobs', input: { query: 'Acme' } },
    ],
    stop_reason: 'tool_use',
    usage: { input_tokens: 120, output_tokens: 40 },
  });

  const step1 = await gateway.runAgentStep({ system: 'sys', turns: [{ role: 'user', content: 'find Acme jobs' }], tools: TOOLS });
  assert.equal(step1.provider, 'anthropic');
  assert.equal(step1.text, 'Let me check.');
  assert.deepEqual(step1.toolCalls, [{ id: 'call_1', name: 'search_jobs', arguments: { query: 'Acme' } }]);
  assert.deepEqual(step1.usage, { inputTokens: 120, outputTokens: 40 });

  const req1 = JSON.parse(fetchCalls[0].init.body);
  assert.deepEqual(req1.tools, [{ name: 'search_jobs', description: 'find jobs', input_schema: TOOLS[0].parameters }]);
  assert.deepEqual(req1.messages, [{ role: 'user', content: 'find Acme jobs' }]);

  // Round trip: feed the tool call and its result back, exactly as agent-runner would.
  queueResponse({ content: [{ type: 'text', text: 'Found it: JDL-2026-0042.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } });
  const turns2 = [
    { role: 'user', content: 'find Acme jobs' },
    { role: 'assistant', content: step1.text, toolCalls: step1.toolCalls },
    { role: 'tool', toolCallId: 'call_1', name: 'search_jobs', content: '[{"ref":1,"label":"JDL-2026-0042"}]' },
  ];
  const step2 = await gateway.runAgentStep({ system: 'sys', turns: turns2, tools: TOOLS });
  assert.equal(step2.toolCalls.length, 0);
  assert.equal(step2.text, 'Found it: JDL-2026-0042.');

  const req2 = JSON.parse(fetchCalls[1].init.body);
  assert.deepEqual(req2.messages[1], {
    role: 'assistant',
    content: [{ type: 'text', text: 'Let me check.' }, { type: 'tool_use', id: 'call_1', name: 'search_jobs', input: { query: 'Acme' } }],
  });
  assert.deepEqual(req2.messages[2], {
    role: 'user',
    content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '[{"ref":1,"label":"JDL-2026-0042"}]' }],
  });
  console.log('Gateway checks passed: Anthropic tool-call round trip (request shape, parsed call, and fed-back tool result).');
}

async function testGeminiToolRoundTrip() {
  currentSettings = baseSettings({ geminiKey: 'k', geminiEnabled: true, geminiAgentToolsValidated: true });
  fetchCalls = [];
  fetchQueue = [];
  queueResponse({
    candidates: [{ content: { parts: [{ functionCall: { name: 'search_jobs', args: { query: 'Acme' } } }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 20 },
  });
  const step = await gateway.runAgentStep({ system: 'sys', turns: [{ role: 'user', content: 'find Acme jobs' }], tools: TOOLS });
  assert.equal(step.provider, 'gemini');
  assert.equal(step.toolCalls.length, 1);
  assert.equal(step.toolCalls[0].name, 'search_jobs');
  assert.deepEqual(step.toolCalls[0].arguments, { query: 'Acme' });
  assert.ok(step.toolCalls[0].id.startsWith('gemini-'), 'Gemini gives no call id, so the gateway must synthesise one');
  assert.deepEqual(step.usage, { inputTokens: 80, outputTokens: 20 });

  const req = JSON.parse(fetchCalls[0].init.body);
  assert.equal(req.tools[0].functionDeclarations[0].name, 'search_jobs');

  // Feeding the tool result back must use a functionResponse part.
  queueResponse({ candidates: [{ content: { parts: [{ text: 'Done.' }] }, finishReason: 'STOP' }] });
  await gateway.runAgentStep({
    system: 'sys',
    turns: [
      { role: 'user', content: 'find Acme jobs' },
      { role: 'assistant', content: '', toolCalls: step.toolCalls },
      { role: 'tool', toolCallId: step.toolCalls[0].id, name: 'search_jobs', content: '[{"ref":1}]' },
    ],
    tools: TOOLS,
  });
  const req2 = JSON.parse(fetchCalls[1].init.body);
  assert.deepEqual(req2.contents[2], { role: 'function', parts: [{ functionResponse: { name: 'search_jobs', response: { content: '[{"ref":1}]' } } }] });
  console.log('Gateway checks passed: Gemini tool-call round trip, including a synthesised call id and functionResponse turn.');
}

async function testGroqToolRoundTrip() {
  currentSettings = baseSettings({ groqKey: 'k', groqEnabled: true, groqAgentToolsValidated: true });
  fetchCalls = [];
  fetchQueue = [];
  queueResponse({
    choices: [{ message: { content: '', tool_calls: [{ id: 'call_9', function: { name: 'search_jobs', arguments: '{"query":"Acme"}' } }] }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 50, completion_tokens: 10 },
  });
  const step = await gateway.runAgentStep({ system: 'sys', turns: [{ role: 'user', content: 'find Acme jobs' }], tools: TOOLS });
  assert.equal(step.provider, 'groq');
  assert.deepEqual(step.toolCalls, [{ id: 'call_9', name: 'search_jobs', arguments: { query: 'Acme' } }]);
  assert.deepEqual(step.usage, { inputTokens: 50, outputTokens: 10 });

  // Malformed tool-call arguments must not crash the whole step.
  queueResponse({
    choices: [{ message: { content: '', tool_calls: [{ id: 'call_x', function: { name: 'search_jobs', arguments: 'not-json' } }] }, finish_reason: 'tool_calls' }],
  });
  const stepBad = await gateway.runAgentStep({ system: 'sys', turns: [{ role: 'user', content: 'x' }], tools: TOOLS });
  assert.deepEqual(stepBad.toolCalls[0].arguments, {});
  console.log('Gateway checks passed: Groq tool-call round trip, tolerating malformed tool-call argument JSON.');
}

async function testFailureModes() {
  // Empty response with no tool calls and no leg to fall back to: fails outright.
  currentSettings = baseSettings({ anthropicKey: 'k', anthropicEnabled: true, anthropicAgentToolsValidated: true });
  fetchQueue = [];
  queueResponse({ content: [], stop_reason: 'end_turn' });
  await assert.rejects(() => gateway.runAgentStep({ system: 's', turns: [{ role: 'user', content: 'x' }], tools: TOOLS }), gateway.AiUnavailableError);

  // Truncated mid tool-call is treated as a failure, not a usable partial call.
  fetchQueue = [];
  queueResponse({ content: [{ type: 'tool_use', id: 'c', name: 'search_jobs', input: {} }], stop_reason: 'max_tokens' });
  await assert.rejects(() => gateway.runAgentStep({ system: 's', turns: [{ role: 'user', content: 'x' }], tools: TOOLS }), gateway.AiUnavailableError);

  // Failover across providers within a single step: Gemini errors, Anthropic answers.
  currentSettings = baseSettings({
    geminiKey: 'k', geminiEnabled: true, geminiAgentToolsValidated: true,
    anthropicKey: 'k', anthropicEnabled: true, anthropicAgentToolsValidated: true,
  });
  fetchQueue = [];
  fetchQueue.push({ body: { error: { message: 'boom' } }, status: 500 });
  queueResponse({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } });
  const step = await gateway.runAgentStep({ system: 's', turns: [{ role: 'user', content: 'x' }], tools: TOOLS });
  assert.equal(step.provider, 'anthropic', 'must fail over from Gemini to the next validated leg');
  console.log('Gateway checks passed: empty/truncated tool responses fail rather than return partial data, and failover crosses providers within one step.');
}

// ---------------------------------------------------------------------------
// settings.ts: the agent-tools-validated flag defaults off and round-trips.
// ---------------------------------------------------------------------------

async function testSettingsFlag() {
  let rows = [];
  const settings = compileTs('../src/lib/ai/settings.ts', (id) => {
    if (id === 'server-only') return {};
    if (id === '@/db') return { db: { select: () => ({ from: () => ({ where: () => rows }) }) } };
    if (id === '@/db/schema') return { settings: { key: 'key', value: 'value' } };
    if (id === 'drizzle-orm') return { inArray: () => true, sql: () => '' };
    return require(id);
  });
  const withNoRows = await settings.getAiSettings();
  assert.equal(withNoRows.geminiAgentToolsValidated, false);
  assert.equal(withNoRows.anthropicAgentToolsValidated, false);
  assert.equal(withNoRows.groqAgentToolsValidated, false);

  rows = [{ key: 'ai_anthropic_agent_tools_validated', value: '1' }];
  const withFlag = await settings.getAiSettings();
  assert.equal(withFlag.anthropicAgentToolsValidated, true);
  assert.equal(withFlag.geminiAgentToolsValidated, false, 'flipping one provider must not flip the others');
  console.log('Settings checks passed: agent-tools-validated defaults false for every provider and is per-provider when set.');
}

// ---------------------------------------------------------------------------
// agent-tools.ts: dispatches a ToolCall to the right scoped read function.
// ---------------------------------------------------------------------------

async function testAgentToolsDispatcher() {
  const dispatchedCalls = [];
  let jobIdForRef = null;
  let proposeResult = { ok: true, proposalId: 9, message: 'Proposal #9 created' };
  const agentTools = compileTs('../src/lib/ai/agent-tools.ts', (id) => {
    if (id === 'server-only') return {};
    if (id === './admin-assistant-tools') {
      return {
        searchJobs: async (staff, query) => { dispatchedCalls.push(['jobs', query]); return [{ kind: 'job', label: 'j' }]; },
        searchReviewFlags: async (staff, opts) => { dispatchedCalls.push(['reviews', opts]); return [{ kind: 'review', label: 'r' }]; },
        searchStockReadings: async (staff, query) => { dispatchedCalls.push(['stock', query]); return [{ kind: 'stock_reading', label: 's' }]; },
        searchReferenceDocuments: async (staff, query) => { dispatchedCalls.push(['documents', query]); return [{ kind: 'document', label: 'd' }]; },
      };
    }
    if (id === '@/lib/job-actions') return { findJobIdByRef: async (ref) => { dispatchedCalls.push(['findJobIdByRef', ref]); return jobIdForRef; } };
    if (id === '@/lib/reviewed-actions') return { proposeJobApproval: async (input) => { dispatchedCalls.push(['proposeJobApproval', input]); return proposeResult; } };
    return require(id);
  });
  const staff = { id: 1, role: 'operations' };

  await agentTools.executeAdminAgentTool(staff, { id: '1', name: 'search_jobs', arguments: { query: 'Acme' } });
  assert.deepEqual(dispatchedCalls.at(-1), ['jobs', 'Acme']);

  await agentTools.executeAdminAgentTool(staff, { id: '2', name: 'search_review_flags', arguments: { query: 'JDL-2026-0001', severity: 'high' } });
  assert.deepEqual(dispatchedCalls.at(-1), ['reviews', { term: 'JDL-2026-0001', severity: 'high' }]);

  await agentTools.executeAdminAgentTool(staff, { id: '3', name: 'search_review_flags', arguments: { severity: 'urgent' } });
  assert.equal(dispatchedCalls.at(-1)[1].severity, null, 'an invalid severity value must not be passed through');

  const unknown = await agentTools.executeAdminAgentTool(staff, { id: '4', name: 'delete_everything', arguments: {} });
  assert.ok('error' in unknown);

  // propose_job_approval resolves the human-visible jobRef to a numeric id, then delegates to the reviewed-actions pipeline — never mutates anything itself.
  const missingRef = await agentTools.executeAdminAgentTool(staff, { id: '5', name: 'propose_job_approval', arguments: { reasoning: 'x' } });
  assert.ok('error' in missingRef, 'jobRef is required');

  jobIdForRef = null;
  const unknownRef = await agentTools.executeAdminAgentTool(staff, { id: '6', name: 'propose_job_approval', arguments: { jobRef: 'JDL-2026-9999', reasoning: 'x' } });
  assert.ok('error' in unknownRef, 'an unresolvable job reference must fail rather than propose against nothing');

  jobIdForRef = 42;
  dispatchedCalls.length = 0;
  const proposed = await agentTools.executeAdminAgentTool(staff, { id: '7', name: 'propose_job_approval', arguments: { jobRef: 'jdl-2026-0042', reasoning: 'flags are clear' } }, 77);
  assert.deepEqual(dispatchedCalls[0], ['findJobIdByRef', 'jdl-2026-0042']);
  assert.deepEqual(dispatchedCalls[1], ['proposeJobApproval', { jobId: 42, agentRunId: 77, proposedByStaffId: 1, reasoning: 'flags are clear' }]);
  assert.deepEqual(proposed, { proposalId: 9, message: 'Proposal #9 created' }, 'a successful proposal must never carry an "error" key, so the model cannot mistake it for a failure');

  proposeResult = { ok: false, message: 'This job isn’t awaiting approval.' };
  const refused = await agentTools.executeAdminAgentTool(staff, { id: '8', name: 'propose_job_approval', arguments: { jobRef: 'JDL-2026-0042', reasoning: 'x' } }, 77);
  assert.deepEqual(refused, { error: 'This job isn’t awaiting approval.' });

  console.log('Agent-tools checks passed: read tools dispatch correctly; propose_job_approval resolves refs and only ever forwards to the reviewed-actions pipeline, never executing anything itself.');
}

// ---------------------------------------------------------------------------
// agent-runner.ts: the bounded loop, its limits, and persisted runs/steps.
// ---------------------------------------------------------------------------

let runsStore, stepsStore, nextRunId, nextStepId;
function resetFakeDb() {
  runsStore = new Map();
  stepsStore = [];
  nextRunId = 1;
  nextStepId = 1;
}
const fakeDb = {
  insert: (table) => ({
    values: (vals) => {
      if (table.__name === 'agentRuns') {
        const id = nextRunId++;
        runsStore.set(id, { id, ...vals });
        return { returning: async () => [{ id }] };
      }
      stepsStore.push({ id: nextStepId++, ...vals });
      return Promise.resolve();
    },
  }),
  update: (table) => ({
    set: (vals) => ({
      where: async (cond) => {
        if (table.__name === 'agentRuns') Object.assign(runsStore.get(cond.__eq), vals);
      },
    }),
  }),
};

let stepQueue, stepCalls;
function runnerRequireOverride() {
  return (id) => {
    if (id === 'server-only') return {};
    if (id === 'drizzle-orm') return { eq: (col, val) => ({ __eq: val }) };
    if (id === '@/db') return { requireDb: () => fakeDb };
    if (id === '@/db/schema') return { agentRuns: { __name: 'agentRuns' }, agentSteps: { __name: 'agentSteps' } };
    if (id === './gateway') {
      return {
        AiUnavailableError: gateway.AiUnavailableError,
        runAgentStep: async (opts) => {
          stepCalls.push(opts);
          const next = stepQueue.shift();
          if (!next) throw new Error('test error: no canned agent step queued');
          if (next.throwError) throw next.throwError;
          return next.value;
        },
      };
    }
    return require(id);
  };
}
const runner = compileTs('../src/lib/ai/agent-runner.ts', runnerRequireOverride());

function assistantStep(text, toolCalls = [], usage = { inputTokens: 100, outputTokens: 50 }) {
  return { value: { provider: 'anthropic', text, toolCalls, usage } };
}

async function testRunnerCompletion() {
  resetFakeDb();
  stepQueue = [
    assistantStep('Looking it up.', [{ id: 'c1', name: 'search_jobs', arguments: { query: 'Acme' } }]),
    assistantStep('Found JDL-2026-0042 [Ref 1].'),
  ];
  stepCalls = [];
  const evidenceItem = { kind: 'job', label: 'JDL-2026-0042', detail: 'd', link: '/admin/jobs/1' };
  const outcome = await runner.runBoundedAgent({
    staff: { id: 7 },
    goal: 'find Acme jobs',
    system: 'sys',
    tools: [],
    executeTool: async () => [evidenceItem],
  });
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.stopReason, 'completed');
  assert.equal(outcome.steps, 2);
  assert.deepEqual(outcome.evidence, [evidenceItem]);
  assert.equal(outcome.finalText, 'Found JDL-2026-0042 [Ref 1].');
  assert.equal(runsStore.get(outcome.runId).status, 'completed');
  assert.equal(stepsStore.filter((s) => s.runId === outcome.runId).length, 3, 'assistant step 1, tool result, assistant step 2');
  console.log('Agent-runner checks passed: natural completion persists every step and stops as soon as no more tool calls are requested.');
}

async function testRunnerStepLimit() {
  resetFakeDb();
  stepQueue = [
    assistantStep('still looking', [{ id: 'c1', name: 'search_jobs', arguments: {} }]),
    assistantStep('still looking', [{ id: 'c2', name: 'search_jobs', arguments: {} }]),
  ];
  stepCalls = [];
  const outcome = await runner.runBoundedAgent({
    staff: { id: 7 }, goal: 'g', system: 's', tools: [],
    executeTool: async () => [],
    limits: { maxSteps: 2 },
  });
  assert.equal(outcome.status, 'stopped_limit');
  assert.equal(outcome.stopReason, 'max_steps');
  assert.equal(outcome.steps, 2);
  console.log('Agent-runner checks passed: a run that never stops calling tools is cut off at the step limit.');
}

async function testRunnerTokenLimit() {
  resetFakeDb();
  stepQueue = [assistantStep('partial', [{ id: 'c1', name: 'search_jobs', arguments: {} }], { inputTokens: 9000, outputTokens: 2000 })];
  stepCalls = [];
  const outcome = await runner.runBoundedAgent({
    staff: { id: 7 }, goal: 'g', system: 's', tools: [],
    executeTool: async () => [],
    limits: { maxTotalTokens: 10_000 },
  });
  assert.equal(outcome.status, 'stopped_limit');
  assert.equal(outcome.stopReason, 'max_tokens');
  assert.equal(outcome.steps, 1);
  assert.equal(outcome.finalText, 'partial', 'the spending limit stops the run after, not instead of, recording the step that tipped it over');
  console.log('Agent-runner checks passed: the token-budget (spending proxy) limit stops the run once a step pushes the total over it.');
}

async function testRunnerToolErrorHandled() {
  resetFakeDb();
  stepQueue = [
    assistantStep('trying', [{ id: 'c1', name: 'search_jobs', arguments: {} }]),
    assistantStep('Recovered after the error.'),
  ];
  stepCalls = [];
  const outcome = await runner.runBoundedAgent({
    staff: { id: 7 }, goal: 'g', system: 's', tools: [],
    executeTool: async () => { throw new Error('db unavailable'); },
  });
  assert.equal(outcome.status, 'completed');
  const toolStep = stepsStore.find((s) => s.runId === outcome.runId && s.role === 'tool');
  assert.ok(JSON.parse(toolStep.content).error.includes('db unavailable'));
  console.log('Agent-runner checks passed: a tool-execution error is fed back to the model as a result, not a crashed run.');
}

async function testRunnerFailure() {
  resetFakeDb();
  stepQueue = [{ throwError: new gateway.AiUnavailableError(['anthropic: down']) }];
  stepCalls = [];
  const outcome = await runner.runBoundedAgent({ staff: { id: 7 }, goal: 'g', system: 's', tools: [], executeTool: async () => [] });
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.stopReason, 'error');
  assert.equal(runsStore.get(outcome.runId).status, 'failed');
  console.log('Agent-runner checks passed: every provider failing marks the run failed (and persists that), rather than throwing out of the API route.');
}

async function testRunnerGlobalRefNumbering() {
  resetFakeDb();
  stepQueue = [
    assistantStep('checking two things', [
      { id: 'c1', name: 'search_jobs', arguments: {} },
      { id: 'c2', name: 'search_stock_readings', arguments: {} },
    ]),
    assistantStep('done'),
  ];
  stepCalls = [];
  let callIndex = 0;
  await runner.runBoundedAgent({
    staff: { id: 7 }, goal: 'g', system: 's', tools: [],
    executeTool: async () => [{ kind: callIndex++ === 0 ? 'job' : 'stock_reading', label: `item-${callIndex}`, detail: '', link: null }],
  });
  const secondCallTurns = stepCalls[1].turns;
  const toolTurns = secondCallTurns.filter((t) => t.role === 'tool');
  assert.equal(JSON.parse(toolTurns[0].content)[0].ref, 1);
  assert.equal(JSON.parse(toolTurns[1].content)[0].ref, 2, 'ref numbers must stay unique across tool calls within the same step, not reset per call');
  console.log('Agent-runner checks passed: [Ref n] numbers are assigned globally across the whole run, never reused across tool calls.');
}

testNoValidatedProvider()
  .then(testAnthropicToolRoundTrip)
  .then(testGeminiToolRoundTrip)
  .then(testGroqToolRoundTrip)
  .then(testFailureModes)
  .then(testSettingsFlag)
  .then(testAgentToolsDispatcher)
  .then(testRunnerCompletion)
  .then(testRunnerStepLimit)
  .then(testRunnerTokenLimit)
  .then(testRunnerToolErrorHandled)
  .then(testRunnerFailure)
  .then(testRunnerGlobalRefNumbering)
  .then(() => { global.fetch = realFetch; })
  .catch((error) => {
    global.fetch = realFetch;
    console.error(error);
    process.exitCode = 1;
  });
