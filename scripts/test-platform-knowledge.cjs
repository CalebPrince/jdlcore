const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
const path = require('node:path');
const file = path.resolve(__dirname, '../src/lib/ai/platform-knowledge.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = module.paths;
loaded._compile(compiled, file);
const { DEFAULT_KNOWLEDGE, knowledgeSchema, renderPlatformKnowledge } = loaded.exports;
assert.equal(knowledgeSchema.safeParse(DEFAULT_KNOWLEDGE).success, true);
const sample = structuredClone(DEFAULT_KNOWLEDGE);
sample.divisions.push({ ...sample.divisions[0], id: 'new-division', name: 'New Division', reviewNotes: 'ADMIN_ONLY_MARKER' });
assert.equal(knowledgeSchema.safeParse(sample).success, true);
const context = renderPlatformKnowledge(sample);
assert.ok(context.includes('New Division'));
assert.ok(!context.includes('ADMIN_ONLY_MARKER'));
assert.ok(!context.includes('reviewNotes'));
sample.divisions[3].id = 'inspection';
assert.equal(knowledgeSchema.safeParse(sample).success, false);
sample.divisions[3].id = '../admin';
assert.equal(knowledgeSchema.safeParse(sample).success, false);
assert.equal(knowledgeSchema.safeParse({ ...sample, divisions: [] }).success, false);
assert.equal(knowledgeSchema.safeParse({ ...DEFAULT_KNOWLEDGE, company: ' ' }).success, false);
assert.equal(knowledgeSchema.safeParse({ ...DEFAULT_KNOWLEDGE, company: 'x'.repeat(2401) }).success, false);

// needsReview / needsReviewNote: default when omitted (old stored rows predate the field), round-trip when set.
{
  const legacyDivision = { ...DEFAULT_KNOWLEDGE.divisions[0] };
  delete legacyDivision.needsReview;
  delete legacyDivision.needsReviewNote;
  const legacyParsed = knowledgeSchema.safeParse({ ...DEFAULT_KNOWLEDGE, divisions: [legacyDivision] });
  assert.equal(legacyParsed.success, true);
  assert.equal(legacyParsed.data.divisions[0].needsReview, false);
  assert.equal(legacyParsed.data.divisions[0].needsReviewNote, '');
  const flagged = { ...DEFAULT_KNOWLEDGE, divisions: [{ ...DEFAULT_KNOWLEDGE.divisions[0], needsReview: true, needsReviewNote: 'job-workflow.ts changed' }] };
  const flaggedParsed = knowledgeSchema.safeParse(flagged);
  assert.equal(flaggedParsed.success, true);
  assert.equal(flaggedParsed.data.divisions[0].needsReview, true);
  assert.equal(knowledgeSchema.safeParse({ ...DEFAULT_KNOWLEDGE, divisions: [{ ...DEFAULT_KNOWLEDGE.divisions[0], needsReviewNote: 'x'.repeat(501) }] }).success, false);
}
console.log('Platform knowledge checks passed: baseline, new divisions, private notes, duplicate IDs, invalid IDs, required fields, size limits and needsReview defaults/round-trip.');

// Retrieval: below budget everything is included unranked; above budget, divisions
// are ranked by relevance to the question and the rest are named but not detailed.
{
  const many = structuredClone(DEFAULT_KNOWLEDGE);
  many.divisions = [];
  for (let i = 0; i < 10; i++) {
    many.divisions.push({
      ...DEFAULT_KNOWLEDGE.divisions[i % 3],
      id: `division-${i}`,
      name: `Division ${i}`,
    });
  }
  // Make one division uniquely and heavily relevant to a specific question.
  many.divisions[7] = { ...many.divisions[7], id: 'gauge-board', name: 'Gauge Board', purpose: 'Purpose mentioning zebraquasar tokens for retrieval testing.' };

  const unbounded = renderPlatformKnowledge(many, { budgetChars: Number.MAX_SAFE_INTEGER });
  assert.ok(unbounded.includes('Gauge Board'));
  assert.ok(!unbounded.includes('not detailed in this context'));

  const bounded = renderPlatformKnowledge(many, { question: 'What does the zebraquasar gauge board do?', budgetChars: 1800 });
  assert.ok(bounded.includes('Gauge Board'), 'the relevant division must survive the budget cut');
  assert.ok(bounded.includes('not detailed in this context'), 'omitted divisions must be named, not silently dropped');
  assert.ok(bounded.length < unbounded.length);

  // Never empty: even an absurdly small budget still keeps the top-ranked division.
  const tiny = renderPlatformKnowledge(many, { question: 'zebraquasar gauge board', budgetChars: 10 });
  assert.ok(tiny.includes('Gauge Board'));

  // Always include the company overview, budget or not.
  assert.ok(bounded.includes(many.company.slice(0, 40)));
}
console.log('Retrieval checks passed: unranked below budget, ranked and trimmed above budget, omitted divisions named, never empty, company overview always present.');

async function testStore() {
  let rows = [];
  let unavailable = false;
  const storeFile = path.resolve(__dirname, '../src/lib/ai/knowledge-store.ts');
  const store = new Module(storeFile, module);
  store.filename = storeFile;
  store.paths = module.paths;
  store.require = (id) => {
    if (id === 'server-only') return {};
    if (id === '@/db') return { db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => { if (unavailable) throw new Error('offline'); return rows; } }) }) }) } };
    if (id === '@/db/schema') return { settings: { key: 'key', value: 'value' } };
    if (id === 'drizzle-orm') return { eq: () => true };
    if (id === './platform-knowledge') return loaded.exports;
    return require(id);
  };
  store._compile(ts.transpileModule(fs.readFileSync(storeFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, storeFile);
  const { initialRegistry, buildPlatformContext } = store.exports;
  assert.ok((await buildPlatformContext()).includes('Inspection Services'));
  const registry = structuredClone(initialRegistry());
  registry.draft.divisions[0].purpose = 'UNPUBLISHED_MARKER';
  registry.published.divisions[0].purpose = 'PUBLISHED_MARKER';
  rows = [{ value: JSON.stringify(registry) }];
  const published = await buildPlatformContext();
  assert.ok(published.includes('PUBLISHED_MARKER'));
  assert.ok(!published.includes('UNPUBLISHED_MARKER'));
  rows = [{ value: '{broken' }];
  assert.ok((await buildPlatformContext()).includes('temporarily unavailable'));
  unavailable = true;
  assert.ok((await buildPlatformContext()).includes('temporarily unavailable'));
  console.log('Store checks passed: baseline, published-only context, malformed storage and database outage.');
}
function compileKnowledgeStore(dbRequireOverride) {
  const storeFile = path.resolve(__dirname, '../src/lib/ai/knowledge-store.ts');
  const store = new Module(storeFile, module);
  store.filename = storeFile;
  store.paths = module.paths;
  store.require = (id) => {
    if (id === 'server-only') return {};
    if (id === '@/db') return dbRequireOverride;
    if (id === '@/db/schema') return { settings: { key: 'key', value: 'value' } };
    if (id === 'drizzle-orm') return { eq: () => true };
    if (id === './platform-knowledge') return loaded.exports;
    return require(id);
  };
  store._compile(ts.transpileModule(fs.readFileSync(storeFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, storeFile);
  return store.exports;
}

async function testAdmin() {
  // In-memory single-row settings table plus a swappable "current actor" so we
  // can exercise the authorization gate without a real staff-auth/DB layer.
  let storedValue; // undefined = no row yet, mirrors a fresh install
  let currentActor = { name: 'Test Admin', role: 'superadmin' };
  const auditEvents = [];
  const fakeDb = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (storedValue === undefined ? [] : [{ value: storedValue }]) }) }) }),
    update: () => ({ set: ({ value }) => ({ where: () => ({ returning: async () => { storedValue = value; return [{ key: 'ai_platform_knowledge_v1' }]; } }) }) }),
    insert: () => ({ values: ({ value }) => ({ onConflictDoNothing: () => ({ returning: async () => { if (storedValue !== undefined) return []; storedValue = value; return [{ key: 'ai_platform_knowledge_v1' }]; } }) }) }),
  };
  const storeExports = compileKnowledgeStore({ requireDb: () => fakeDb, db: fakeDb });

  const adminFile = path.resolve(__dirname, '../src/app/actions/knowledge-admin.ts');
  const adminModule = new Module(adminFile, module);
  adminModule.filename = adminFile;
  adminModule.paths = module.paths;
  adminModule.require = (id) => {
    if (id === 'server-only') return {};
    if (id === 'next/cache') return { revalidatePath: () => {} };
    if (id === 'drizzle-orm') return { and: () => true, eq: () => true };
    if (id === '@/db') return { requireDb: () => fakeDb };
    if (id === '@/db/schema') return { settings: { key: 'key', value: 'value' } };
    if (id === '@/lib/staff-auth') return { requireStaffRole: async () => currentActor };
    if (id === '@/lib/audit') return { logAudit: async (event) => { auditEvents.push(event); } };
    if (id === '@/lib/ai/platform-knowledge') return loaded.exports;
    if (id === '@/lib/ai/knowledge-store') return storeExports;
    return require(id);
  };
  // knowledge-admin.ts is "use server" — strip the directive so transpileModule
  // (a single-file, non-bundled transform) doesn't choke on Next's server-action
  // conventions; the directive has no meaning outside the Next build pipeline.
  const adminSource = fs.readFileSync(adminFile, 'utf8').replace(/^"use server";?\s*/, '');
  adminModule._compile(ts.transpileModule(adminSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, adminFile);
  const { savePlatformKnowledge, rollbackPlatformKnowledge } = adminModule.exports;

  const form = (fields) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  };
  const knowledgeWith = (marker) => JSON.stringify({ ...DEFAULT_KNOWLEDGE, company: `${DEFAULT_KNOWLEDGE.company} ${marker}` });

  // First publish ever: history should already gain one entry for the code baseline.
  let result = await savePlatformKnowledge({ ok: false, message: '', revision: 0 }, form({ intent: 'publish', revision: 0, knowledge: knowledgeWith('V1') }));
  assert.equal(result.ok, true);
  assert.ok(result.message.includes('Version 1 published'));
  let registry = JSON.parse(storedValue);
  assert.equal(registry.publishedVersion, 1);
  assert.equal(registry.publishedBy, 'Test Admin');
  assert.equal(registry.history.length, 1);
  assert.equal(registry.history[0].version, 0);
  assert.equal(registry.history[0].publishedBy, 'Code baseline');
  assert.ok(registry.published.company.includes('V1'));

  // Second publish: history gains version 1 at the front (most recent first).
  result = await savePlatformKnowledge({ ok: false, message: '', revision: result.revision }, form({ intent: 'publish', revision: result.revision, knowledge: knowledgeWith('V2') }));
  assert.equal(result.ok, true);
  registry = JSON.parse(storedValue);
  assert.equal(registry.publishedVersion, 2);
  assert.equal(registry.history.length, 2);
  assert.equal(registry.history[0].version, 1);
  assert.equal(registry.history[1].version, 0);

  // Stale revision is rejected before any write, regardless of intent.
  const stale = await savePlatformKnowledge({ ok: false, message: '', revision: 0 }, form({ intent: 'draft', revision: 0, knowledge: knowledgeWith('STALE') }));
  assert.equal(stale.ok, false);
  assert.ok(stale.message.includes('Another administrator updated this knowledge'));
  assert.ok(!JSON.parse(storedValue).draft.company.includes('STALE'), 'a rejected save must not mutate storage');

  // Rolling back to a version outside recorded history fails cleanly.
  const badRollback = await rollbackPlatformKnowledge({ ok: false, message: '', revision: result.revision }, form({ revision: result.revision, version: 999 }));
  assert.equal(badRollback.ok, false);
  assert.ok(badRollback.message.includes('no longer available'));

  // Roll back to the original code baseline (version 0): republishes as a new
  // version with the old content, and the superseded version 2 joins history.
  const rollback = await rollbackPlatformKnowledge({ ok: false, message: '', revision: result.revision }, form({ revision: result.revision, version: 0 }));
  assert.equal(rollback.ok, true);
  assert.ok(rollback.message.includes('Rolled back to version 0'));
  registry = JSON.parse(storedValue);
  assert.equal(registry.publishedVersion, 3);
  assert.deepEqual(registry.published, DEFAULT_KNOWLEDGE);
  assert.deepEqual(registry.draft, DEFAULT_KNOWLEDGE);
  assert.equal(registry.history.length, 3);
  assert.equal(registry.history[0].version, 2);

  // Only a superadmin may publish or roll back.
  currentActor = null;
  const unauthorized = await savePlatformKnowledge({ ok: false, message: '', revision: rollback.revision }, form({ intent: 'draft', revision: rollback.revision, knowledge: knowledgeWith('NOPE') }));
  assert.equal(unauthorized.ok, false);
  assert.equal(unauthorized.message, 'Unauthorized.');
  currentActor = { name: 'Test Admin', role: 'superadmin' };

  assert.ok(auditEvents.some((event) => event.action === 'settings.knowledge_publish'));
  assert.ok(auditEvents.some((event) => event.action === 'settings.knowledge_rollback'));

  console.log('Admin action checks passed: history accrual on publish, stale-revision rejection, rollback to an old version (including the code baseline), missing-version rollback, and the superadmin-only gate.');
}

testStore()
  .then(testAdmin)
  .catch((error) => { console.error(error); process.exitCode = 1; });
