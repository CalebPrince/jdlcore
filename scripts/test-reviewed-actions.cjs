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

// job-workflow.ts is pure (no imports) — compile it for real and reuse everywhere canTransition is needed.
const jobWorkflow = compileTs('../src/lib/job-workflow.ts');
const OPS_ACTOR = { type: 'staff', id: 5, name: 'Jane', role: 'operations' };

// ---------------------------------------------------------------------------
// job-actions.ts: the extracted, shared job-approval business logic.
// ---------------------------------------------------------------------------

function makeJobsFakeDb() {
  const jobsStore = new Map([[42, { id: 42, ref: 'JDL-2026-0042', status: 'awaiting_approval', clientId: 1, service: 'Stock Monitoring', approvedAt: null, approvedByStaffId: null, updatedAt: null }]]);
  const clientsStore = new Map([[1, { id: 1, name: 'Acme Ltd', company: 'Acme Petroleum' }]]);
  const jobUpdatesLog = [];
  const coqCalls = [];
  const revalidateCalls = [];

  function chain(resultFn) {
    const c = {
      from: () => c,
      innerJoin: () => c,
      where: (cond) => { c._cond = cond; return c; },
      limit: async () => resultFn(c._cond),
    };
    return c;
  }
  function matches(row, cond) {
    if (!cond) return true;
    if (cond.__type === 'and') return cond.conditions.every((c) => matches(row, c));
    return row[cond.field] === cond.value;
  }

  const fakeDb = {
    select: (fields) => chain((cond) => {
      // Distinguish loadJobForApproval's client join from findJobIdByRef's plain job lookup by which fields were requested.
      const wantsClient = fields && 'clientName' in fields;
      const job = [...jobsStore.values()].find((j) => matches(j, cond));
      if (!job) return [];
      if (!wantsClient) return [{ id: job.id }];
      const client = clientsStore.get(job.clientId);
      return [{ id: job.id, ref: job.ref, status: job.status, service: job.service, clientId: job.clientId, clientName: client.name, clientCompany: client.company }];
    }),
    update: (table) => ({
      set: (vals) => ({
        where: async (cond) => {
          const job = [...jobsStore.values()].find((j) => matches(j, cond));
          if (job) Object.assign(job, vals);
        },
      }),
    }),
    insert: () => ({
      values: async (vals) => { jobUpdatesLog.push(vals); },
    }),
  };
  return { fakeDb, jobsStore, clientsStore, jobUpdatesLog, coqCalls, revalidateCalls };
}

function jobActionsRequireOverride(state) {
  return (id) => {
    if (id === 'server-only') return {};
    if (id === 'next/cache') return { revalidatePath: (p) => state.revalidateCalls.push(p) };
    if (id === 'drizzle-orm') return { eq: (field, value) => ({ __type: 'eq', field, value }) };
    if (id === '@/db') return { requireDb: () => state.fakeDb };
    if (id === '@/db/schema') return {
      clients: { id: 'id', name: 'name', company: 'company' },
      jobs: { id: 'id', ref: 'ref', clientId: 'clientId', status: 'status' },
      jobUpdates: {},
    };
    if (id === '@/lib/job-workflow') return jobWorkflow;
    if (id === '@/lib/coq') return { generateCoqAndInvoice: async (jobId, staffId) => { state.coqCalls.push([jobId, staffId]); return { certificateId: 1, invoiceId: 1, coqNumber: 'COQ-1', invoiceNumber: 'INV-1' }; } };
    return require(id);
  };
}

async function testJobActions() {
  const state = makeJobsFakeDb();
  const jobActions = compileTs('../src/lib/job-actions.ts', jobActionsRequireOverride(state));

  assert.equal(await jobActions.findJobIdByRef('jdl-2026-0042'), 42, 'ref lookup must be case-insensitive');
  assert.equal(await jobActions.findJobIdByRef('JDL-2026-9999'), null);

  const job = await jobActions.loadJobForApproval(42);
  assert.equal(job.clientCompany, 'Acme Petroleum');

  assert.deepEqual(jobActions.checkJobApprovable({ status: 'awaiting_approval' }, OPS_ACTOR), { ok: true });
  assert.equal(jobActions.checkJobApprovable({ status: 'in_progress' }, OPS_ACTOR).ok, false, 'reuses the real job-workflow transition rule, not a reimplementation');

  const result = await jobActions.approveJobCore(42, { id: 5, name: 'Jane', role: 'operations' });
  assert.equal(result.ok, true);
  assert.equal(state.jobsStore.get(42).status, 'invoice_issued', 'must run all the way through to invoice_issued, matching the original approveJob Server Action');
  assert.equal(state.jobUpdatesLog.length, 3, 'approved, report_issued, invoice_issued timeline entries');
  assert.deepEqual(state.coqCalls, [[42, 5]]);
  assert.ok(state.revalidateCalls.includes('/admin/actions'), 'the reviewed-actions queue must also be revalidated, since a proposal execution lands here too');

  const missing = await jobActions.approveJobCore(999, { id: 5, name: 'Jane', role: 'operations' });
  assert.equal(missing.ok, false);
  console.log('Job-actions checks passed: ref lookup, the real job-workflow transition rule reused (not reimplemented), and the full approval side effects (status, timeline, CoQ/invoice, revalidation).');
}

// ---------------------------------------------------------------------------
// reviewed-actions.ts: the generic proposal lifecycle, in isolation from any
// one action type's business logic (job-actions.ts is stubbed here).
// ---------------------------------------------------------------------------

function makeProposalsFakeDb() {
  const store = new Map();
  let nextId = 1;
  function matches(row, cond) {
    if (!cond) return true;
    if (cond.__type === 'and') return cond.conditions.every((c) => matches(row, c));
    return row[cond.field] === cond.value;
  }
  function chain() {
    const c = {
      from: () => c,
      leftJoin: () => c,
      orderBy: () => c,
      where: (cond) => { c._cond = cond; return c; },
      limit: async () => {
        const row = [...store.values()].find((r) => matches(r, c._cond));
        return row ? [row] : [];
      },
    };
    return c;
  }
  const fakeDb = {
    select: () => chain(),
    insert: () => ({
      values: (vals) => {
        const id = nextId++;
        store.set(id, { id, reviewedByStaffId: null, reviewedAt: null, reviewNote: null, approvedState: null, executionResult: null, executedAt: null, agentRunId: null, proposedByStaffId: null, status: 'pending', ...vals });
        return { returning: async () => [{ id }] };
      },
    }),
    update: () => ({
      set: (vals) => ({
        where: (cond) => ({
          returning: async () => {
            const row = [...store.values()].find((r) => matches(r, cond));
            if (!row) return [];
            Object.assign(row, vals);
            return [{ id: row.id }];
          },
        }),
      }),
    }),
  };
  return { fakeDb, store };
}

function makeJobActionsStub(overrides = {}) {
  const calls = [];
  const state = {
    job: { status: 'awaiting_approval', ref: 'JDL-2026-0042', clientName: 'Acme Ltd', clientCompany: 'Acme Petroleum', service: 'Stock Monitoring' },
    approvableAtPropose: true,
    approvableAtApprove: true,
    approveResult: { ok: true, message: 'Job approved — Certificate of Quantity and invoice issued.' },
    approveThrows: null,
    ...overrides,
  };
  let checkCallCount = 0;
  return {
    calls,
    stub: {
      loadJobForApproval: async (jobId) => { calls.push(['loadJobForApproval', jobId]); return state.job; },
      checkJobApprovable: (job, actor) => {
        checkCallCount += 1;
        calls.push(['checkJobApprovable', checkCallCount]);
        const ok = checkCallCount === 1 ? state.approvableAtPropose : state.approvableAtApprove;
        return ok ? { ok: true } : { ok: false, message: "This job isn't awaiting approval." };
      },
      approveJobCore: async (jobId, staff) => {
        calls.push(['approveJobCore', jobId, staff.id]);
        if (state.approveThrows) throw state.approveThrows;
        return state.approveResult;
      },
    },
  };
}

function reviewedActionsRequireOverride(fakeDb, jobActionsStub) {
  return (id) => {
    if (id === 'server-only') return {};
    if (id === 'drizzle-orm') return {
      and: (...conditions) => ({ __type: 'and', conditions }),
      eq: (field, value) => ({ __type: 'eq', field, value }),
      ne: (field, value) => ({ __type: 'ne', field, value }),
      desc: () => null,
    };
    if (id === 'drizzle-orm/pg-core') return { alias: (table, name) => ({ __alias: name }) };
    if (id === '@/db') return { requireDb: () => fakeDb };
    if (id === '@/db/schema') return {
      proposedActions: {
        id: 'id', actionType: 'actionType', targetType: 'targetType', targetId: 'targetId', summary: 'summary',
        payload: 'payload', proposedState: 'proposedState', status: 'status', agentRunId: 'agentRunId',
        proposedByStaffId: 'proposedByStaffId', reviewedByStaffId: 'reviewedByStaffId', reviewedAt: 'reviewedAt',
        reviewNote: 'reviewNote', approvedState: 'approvedState', executionResult: 'executionResult',
        executedAt: 'executedAt', createdAt: 'createdAt',
      },
      staff: {},
    };
    if (id === '@/lib/job-actions') return jobActionsStub;
    return require(id);
  };
}

function compileReviewedActions(jobActionsStub) {
  const { fakeDb, store } = makeProposalsFakeDb();
  const reviewedActions = compileTs('../src/lib/reviewed-actions.ts', reviewedActionsRequireOverride(fakeDb, jobActionsStub));
  return { reviewedActions, store };
}

const OPS_STAFF = { id: 5, name: 'Jane', role: 'operations' };
const CLIENT_STAFF = { id: 9, name: 'Someone', role: 'client' };

async function testProposeJobApproval() {
  const { stub } = makeJobActionsStub();
  const { reviewedActions, store } = compileReviewedActions(stub);

  const result = await reviewedActions.proposeJobApproval({ jobId: 42, agentRunId: 7, proposedByStaffId: 1, reasoning: 'Flags are clear.' });
  assert.equal(result.ok, true);
  const row = store.get(result.proposalId);
  assert.equal(row.actionType, 'job_approval');
  assert.equal(row.status, 'pending');
  assert.deepEqual(row.payload, { jobId: 42 });
  assert.deepEqual(row.proposedState, { status: 'awaiting_approval', ref: 'JDL-2026-0042' });
  assert.ok(row.summary.includes('JDL-2026-0042') && row.summary.includes('Reasoning: Flags are clear.'));
  console.log('proposeJobApproval checks passed: creates a pending proposal with an exact payload/state snapshot and a human-readable summary.');
}

async function testProposeRefusedWhenNotTransitionable() {
  const { stub } = makeJobActionsStub({ approvableAtPropose: false });
  const { reviewedActions, store } = compileReviewedActions(stub);

  const result = await reviewedActions.proposeJobApproval({ jobId: 42, reasoning: 'x' });
  assert.equal(result.ok, false);
  assert.equal(store.size, 0, 'an invalid transition must never even become a proposal — this is the "reuse job transition rules to prepare exact proposed changes" requirement');
  console.log('proposeJobApproval checks passed: refuses to create a proposal when the job-workflow transition rule already rejects it.');
}

async function testApproveHappyPath() {
  const { stub, calls } = makeJobActionsStub();
  const { reviewedActions, store } = compileReviewedActions(stub);
  const { proposalId } = await reviewedActions.proposeJobApproval({ jobId: 42, reasoning: 'x' });

  const result = await reviewedActions.approveProposal(proposalId, OPS_STAFF);
  assert.equal(result.ok, true);
  const row = store.get(proposalId);
  assert.equal(row.status, 'executed');
  assert.equal(row.reviewedByStaffId, 5);
  assert.deepEqual(row.approvedState, { status: 'awaiting_approval', ref: 'JDL-2026-0042' });
  assert.deepEqual(row.executionResult, { ok: true, message: 'Job approved — Certificate of Quantity and invoice issued.' });
  assert.equal(calls.filter((c) => c[0] === 'checkJobApprovable').length, 2, 'must recheck the transition rule again at approval time, not just trust the proposal-time check');
  assert.equal(calls.filter((c) => c[0] === 'approveJobCore').length, 1);
  console.log('approveProposal checks passed: fresh recheck at approval time, a recorded approval-time state snapshot, and the underlying business action actually runs.');
}

async function testApprovePermissionRecheck() {
  const { stub, calls } = makeJobActionsStub();
  const { reviewedActions, store } = compileReviewedActions(stub);
  const { proposalId } = await reviewedActions.proposeJobApproval({ jobId: 42, reasoning: 'x' });

  const result = await reviewedActions.approveProposal(proposalId, CLIENT_STAFF);
  assert.equal(result.ok, false);
  assert.match(result.message, /permission/i);
  assert.equal(store.get(proposalId).status, 'pending', 'a rejected permission check must not move the proposal at all');
  assert.equal(calls.filter((c) => c[0] === 'approveJobCore').length, 0);
  console.log('approveProposal checks passed: a reviewer without this action type\'s required role is refused before anything executes.');
}

async function testApproveStaleness() {
  const { stub, calls } = makeJobActionsStub({ approvableAtApprove: false });
  const { reviewedActions, store } = compileReviewedActions(stub);
  const { proposalId } = await reviewedActions.proposeJobApproval({ jobId: 42, reasoning: 'x' });

  const result = await reviewedActions.approveProposal(proposalId, OPS_STAFF);
  assert.equal(result.ok, false);
  assert.equal(store.get(proposalId).status, 'stale', 'the target changed between proposal and approval, so this must never execute');
  assert.equal(calls.filter((c) => c[0] === 'approveJobCore').length, 0);
  console.log('approveProposal checks passed: a target whose state changed since the proposal was made is marked stale and never executed.');
}

async function testApproveIdempotentOnRetry() {
  const { stub, calls } = makeJobActionsStub();
  const { reviewedActions } = compileReviewedActions(stub);
  const { proposalId } = await reviewedActions.proposeJobApproval({ jobId: 42, reasoning: 'x' });

  const first = await reviewedActions.approveProposal(proposalId, OPS_STAFF);
  const retry = await reviewedActions.approveProposal(proposalId, OPS_STAFF);
  assert.equal(first.ok, true);
  assert.equal(retry.ok, false);
  assert.match(retry.message, /already/i);
  assert.equal(calls.filter((c) => c[0] === 'approveJobCore').length, 1, 'a retried approval on an already-decided proposal must never execute the underlying action twice');
  console.log('approveProposal checks passed: a retried approval call on the same proposal never re-executes the underlying action.');
}

async function testApproveExecutionFailureRecorded() {
  const { stub } = makeJobActionsStub({ approveThrows: new Error('db unavailable') });
  const { reviewedActions, store } = compileReviewedActions(stub);
  const { proposalId } = await reviewedActions.proposeJobApproval({ jobId: 42, reasoning: 'x' });

  const result = await reviewedActions.approveProposal(proposalId, OPS_STAFF);
  assert.equal(result.ok, false);
  const row = store.get(proposalId);
  assert.equal(row.status, 'failed');
  assert.ok(row.executionResult.message.includes('db unavailable'), 'a failed execution must be recorded, not lost, so it is visible for a human to investigate');
  console.log('approveProposal checks passed: an execution failure is durably recorded on the proposal rather than left unresolved.');
}

async function testRejectProposal() {
  const { stub } = makeJobActionsStub();
  const { reviewedActions, store } = compileReviewedActions(stub);
  const { proposalId } = await reviewedActions.proposeJobApproval({ jobId: 42, reasoning: 'x' });

  const noNote = await reviewedActions.rejectProposal(proposalId, OPS_STAFF, '  ');
  assert.equal(noNote.ok, false, 'a rejection note is required, mirroring rejectJob\'s own comment requirement');

  const wrongRole = await reviewedActions.rejectProposal(proposalId, CLIENT_STAFF, 'not valid');
  assert.equal(wrongRole.ok, false);

  const result = await reviewedActions.rejectProposal(proposalId, OPS_STAFF, 'Numbers look off — please recheck.');
  assert.equal(result.ok, true);
  const row = store.get(proposalId);
  assert.equal(row.status, 'rejected');
  assert.equal(row.reviewNote, 'Numbers look off — please recheck.');

  const again = await reviewedActions.rejectProposal(proposalId, OPS_STAFF, 'too late');
  assert.equal(again.ok, false, 'an already-decided proposal cannot be rejected again');
  console.log('rejectProposal checks passed: requires a note, rechecks permission, and cannot be re-decided once settled.');
}

testJobActions()
  .then(testProposeJobApproval)
  .then(testProposeRefusedWhenNotTransitionable)
  .then(testApproveHappyPath)
  .then(testApprovePermissionRecheck)
  .then(testApproveStaleness)
  .then(testApproveIdempotentOnRetry)
  .then(testApproveExecutionFailureRecorded)
  .then(testRejectProposal)
  .catch((error) => { console.error(error); process.exitCode = 1; });
