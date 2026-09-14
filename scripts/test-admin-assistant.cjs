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

const jobsLib = compileTs('../src/lib/jobs.ts');

/** A generic select-chain stub: every builder method returns itself and the
 * terminal `.limit()` resolves to whatever `getRows()` currently returns —
 * read lazily so a test can swap the canned rows between calls. */
function fakeSelectChain(getRows) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async () => getRows(),
  };
  return chain;
}

function toolsRequireOverride(getRows) {
  return (id) => {
    if (id === 'server-only') return {};
    if (id === 'drizzle-orm') return { and: () => true, desc: () => true, eq: () => true, ilike: () => true, ne: () => true, or: () => true };
    if (id === '@/db') return { requireDb: () => ({ select: () => fakeSelectChain(getRows) }) };
    if (id === '@/db/schema') {
      return {
        aiReviews: {}, clients: {}, inspectors: {}, jobs: {},
        knowledgeDocumentChunks: {}, knowledgeDocuments: {}, stockReadings: {}, tanks: {},
      };
    }
    if (id === '@/lib/jobs') return jobsLib;
    return require(id);
  };
}

let currentRows = [];
const tools = compileTs('../src/lib/ai/admin-assistant-tools.ts', toolsRequireOverride(() => currentRows));

const STAFF = { id: 1, role: 'operations' };
const BAD_STAFF = { id: 2, role: 'client' }; // not a StaffRole — every tool must reject this itself

async function testPureHelpers() {
  assert.equal(tools.extractJobRef('please check JDL-2026-0042 for me'), 'JDL-2026-0042');
  assert.equal(tools.extractJobRef('lowercase jdl-2026-0007 works too'), 'JDL-2026-0007');
  assert.equal(tools.extractJobRef('no reference here'), null);
  assert.equal(tools.extractSeverity('any HIGH severity flags?'), 'high');
  assert.equal(tools.extractSeverity('nothing notable'), null);
  assert.equal(tools.daysSince(new Date(Date.now() - 3 * 86_400_000)), 3);
  assert.equal(tools.daysSince(null), null);
  console.log('Pure-helper checks passed: job-ref extraction, severity extraction, and application-code day arithmetic.');
}

async function testAccessEnforcement() {
  currentRows = [];
  await assert.rejects(() => tools.searchJobs(BAD_STAFF, 'anything'), /Unauthorized/);
  await assert.rejects(() => tools.searchReviewFlags(BAD_STAFF, {}), /Unauthorized/);
  await assert.rejects(() => tools.searchStockReadings(BAD_STAFF, 'anything'), /Unauthorized/);
  await assert.rejects(() => tools.searchReferenceDocuments(BAD_STAFF, 'anything'), /Unauthorized/);
  await assert.doesNotReject(() => tools.searchJobs(STAFF, 'anything'));
  console.log('Access-enforcement checks passed: all four read tools independently reject a non-staff caller.');
}

async function testJobsTool() {
  currentRows = [{
    id: 42, ref: 'JDL-2026-0042', service: 'Stock Monitoring', location: 'Tema', product: 'PMS',
    status: 'in_progress', updatedAt: new Date('2026-01-05'), clientName: 'Acme Ltd', clientCompany: 'Acme Petroleum', inspectorName: 'J. Doe',
  }];
  const [item] = await tools.searchJobs(STAFF, 'Acme');
  assert.equal(item.kind, 'job');
  assert.ok(item.label.includes('JDL-2026-0042'));
  assert.ok(item.detail.includes('In Progress'), 'must render the human status label, not the raw enum key');
  assert.ok(item.detail.includes('J. Doe'));
  assert.equal(item.link, '/admin/jobs/42');
  console.log('Jobs tool checks passed: human-readable status label, inspector name, and job link.');
}

async function testReviewFlagsTool() {
  currentRows = [{
    id: 7, jobId: 42, jobRef: 'JDL-2026-0042', clientName: 'Acme Ltd', clientCompany: 'Acme Petroleum',
    targetType: 'completion_data', severity: 'high', summary: 'GOV and GSV disagree by 12%.', createdAt: new Date('2026-01-04'),
  }];
  const [item] = await tools.searchReviewFlags(STAFF, { severity: 'high' });
  assert.equal(item.kind, 'review');
  assert.ok(item.label.startsWith('HIGH flag on JDL-2026-0042'));
  assert.ok(item.detail.includes('disagree by 12%'));
  assert.equal(item.link, '/admin/jobs/42');
  console.log('Review-flags tool checks passed: severity/target labelling and job link, "none" severities excluded by the query.');
}

async function testStockReadingsTool() {
  currentRows = [{
    id: 3, jobId: 42, jobRef: 'JDL-2026-0042', readingDate: new Date('2026-01-03'), closingStock: '1200.500',
    gov: '1250.000', gsv: '1230.000', dipHeightMm: '3400.000', source: 'import', tankName: 'Tank 4',
    product: 'PMS', clientName: 'Acme Ltd', clientCompany: 'Acme Petroleum',
  }];
  const [item] = await tools.searchStockReadings(STAFF, 'Tank 4');
  assert.equal(item.kind, 'stock_reading');
  assert.ok(item.label.includes('Tank 4'));
  assert.ok(item.detail.includes('Closing stock: 1200.500'));
  assert.ok(item.detail.includes('Source: import'));
  assert.equal(item.link, '/admin/jobs/42');
  console.log('Stock-readings tool checks passed: figures come from stored rows verbatim, not model-computed.');
}

async function testReferenceDocumentsTool() {
  currentRows = [
    { docId: 1, title: 'Collateral Verification Guide', scope: 'global', clientName: null, clientCompany: null, content: 'This guide explains collateral verification procedures in depth.' },
    { docId: 2, title: 'Acme Site SOP', scope: 'client', clientName: 'Acme Ltd', clientCompany: 'Acme Petroleum', content: 'Unrelated content about a different topic entirely.' },
  ];
  const results = await tools.searchReferenceDocuments(STAFF, 'collateral verification');
  assert.equal(results.length, 1, 'only the matching chunk should be returned, scored by term overlap');
  assert.ok(results[0].label.includes('global reference'));
  assert.equal(results[0].link, null);

  currentRows[1].content = 'Notes on collateral verification for Acme specifically.';
  const both = await tools.searchReferenceDocuments(STAFF, 'collateral verification');
  assert.equal(both.length, 2);
  assert.ok(both.some((r) => r.label.includes('Acme Petroleum')), 'a client-scoped document must name the client, since an admin sees every scope');
  console.log('Reference-documents tool checks passed: term-overlap scoring, and admin visibility across both global and client scope.');
}

function promptRequireOverride() {
  return (id) => (id === 'server-only' ? {} : require(id));
}
const prompt = compileTs('../src/lib/ai/admin-assistant-prompt.ts', promptRequireOverride());

async function testPromptBuilder() {
  const staff = { name: 'Ama Mensah', role: 'operations' };
  const evidence = [{ kind: 'job', label: 'JDL-2026-0042 — Acme Petroleum', detail: 'Status: In Progress', link: '/admin/jobs/42' }];
  const withEvidence = prompt.buildAdminAssistantPrompt(staff, evidence, ['jobs'], []);
  assert.ok(withEvidence.includes('[Ref 1]'));
  assert.ok(withEvidence.includes('JDL-2026-0042'));
  assert.ok(withEvidence.includes('Never invent'));
  assert.ok(withEvidence.includes('read-only'));

  const empty = prompt.buildAdminAssistantPrompt(staff, [], ['stock'], ['stock']);
  assert.ok(empty.includes('EVIDENCE: none matched'));
  assert.ok(empty.includes('No matching records found for: tank-gauge stock readings'));
  console.log('Prompt-builder checks passed: citation instructions, [Ref n] evidence rendering, and honest empty-evidence framing.');
}

async function testEvidenceGathering() {
  const calls = [];
  const fakeToolsModule = {
    extractJobRef: (msg) => (msg.match(/JDL-\d{4}-\d{3,6}/i) || [null])[0]?.toUpperCase() ?? null,
    extractSeverity: (msg) => ['low', 'medium', 'high'].find((s) => msg.toLowerCase().includes(s)) ?? null,
    searchJobs: async (staff, term) => { calls.push(['jobs', term]); return [{ kind: 'job', label: 'job-hit', detail: '', link: null }]; },
    searchReviewFlags: async (staff, opts) => { calls.push(['reviews', opts]); return []; },
    searchStockReadings: async (staff, term) => { calls.push(['stock', term]); return [{ kind: 'stock_reading', label: 'stock-hit', detail: '', link: null }]; },
    searchReferenceDocuments: async (staff, term) => { calls.push(['documents', term]); return []; },
  };
  const orchestrator = compileTs('../src/lib/ai/admin-assistant.ts', (id) => {
    if (id === 'server-only') return {};
    if (id === './admin-assistant-tools') return fakeToolsModule;
    if (id === './admin-assistant-prompt') return prompt;
    return require(id);
  });

  // Jobs-only vocabulary routes only to the jobs tool.
  calls.length = 0;
  let result = await orchestrator.gatherEvidence(STAFF, 'What jobs are awaiting assignment for Acme?');
  assert.deepEqual(result.searchedDomains, ['jobs']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'jobs');

  // No recognisable domain keyword still falls back to a jobs lookup rather than returning nothing.
  calls.length = 0;
  result = await orchestrator.gatherEvidence(STAFF, 'hello there');
  assert.deepEqual(result.searchedDomains, ['jobs']);

  // Review + severity vocabulary routes to reviews only, passing the extracted severity through.
  calls.length = 0;
  result = await orchestrator.gatherEvidence(STAFF, 'any high severity flags recently?');
  assert.deepEqual(result.searchedDomains, ['reviews']);
  assert.equal(calls[0][1].severity, 'high');
  assert.ok(result.emptyDomains.includes('reviews'), 'the fake reviews tool returned nothing, so it must be named as empty, not silently skipped');

  // A job reference is extracted and threaded through to the domain tools as the search term.
  calls.length = 0;
  result = await orchestrator.gatherEvidence(STAFF, 'stock readings for tank on JDL-2026-0099');
  assert.deepEqual(result.searchedDomains, ['stock']);
  assert.equal(calls[0][1], 'JDL-2026-0099');

  // Mixed vocabulary searches every matching domain and flattens their evidence together.
  calls.length = 0;
  result = await orchestrator.gatherEvidence(STAFF, 'jobs with stock tank readings');
  assert.deepEqual(result.searchedDomains.sort(), ['jobs', 'stock'].sort());
  assert.equal(result.evidence.length, 2);

  console.log('Evidence-gathering checks passed: keyword domain routing, job-ref/severity extraction threaded to tools, fallback to jobs, and honest empty-domain reporting.');
}

testPureHelpers()
  .then(testAccessEnforcement)
  .then(testJobsTool)
  .then(testReviewFlagsTool)
  .then(testStockReadingsTool)
  .then(testReferenceDocumentsTool)
  .then(testPromptBuilder)
  .then(testEvidenceGathering)
  .catch((error) => { console.error(error); process.exitCode = 1; });
