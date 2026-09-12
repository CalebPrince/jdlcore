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
console.log('Platform knowledge checks passed: baseline, new divisions, private notes, duplicate IDs, invalid IDs, required fields and size limits.');

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
testStore().catch((error) => { console.error(error); process.exitCode = 1; });
