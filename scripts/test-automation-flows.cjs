#!/usr/bin/env node
/**
 * Integration test for the assignment and approval automation. Runs the REAL code (src/lib/...) against
 * an in-memory Postgres (PGlite) built from the app's own schema, so nothing touches a real database
 * and no email is sent (email is unconfigured in the test database).
 *
 *   npm i --no-save @electric-sql/pglite      # once; deliberately not a project dependency
 *   node scripts/test-automation-flows.cjs
 *
 * Covers: auto-assignment (match, no match, decline then retry, timeout reassignment), the approval
 * checks, shadow vs automatic approval with the hold window, the shared approve function, the admin
 * screens' actions (create job, convert quote, edit job details, assign, approve, return), the daily
 * digest, and the schema check. The framework pieces (cookies, revalidation) and the staff session are
 * stubbed; everything else is the real code.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { execSync } = require("node:child_process");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
process.chdir(ROOT);

let PGlite;
try {
  ({ PGlite } = require("@electric-sql/pglite"));
} catch {
  console.error("Missing dependency. Run:  npm i --no-save @electric-sql/pglite");
  process.exit(2);
}
const ts = require("typescript");

// ---- load TypeScript source directly, with the app's "@/..." alias and without "server-only"
const dbHolder = {};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/db") return dbHolder;
  if (request === "next/cache") return { revalidatePath() {}, revalidateTag() {} };
  if (request === "next/navigation") return { redirect() { throw new Error("redirect"); } };
  if (request === "next/headers") {
    return { cookies: async () => ({ get: () => undefined, set() {}, delete() {} }), headers: async () => ({ get: () => null }) };
  }
  if (request === "next/server") {
    return { NextResponse: { json: (body, init) => ({ body, status: (init && init.status) || 200 }) } };
  }
  if (request === "@/lib/inspector-auth") {
    return new Proxy({}, { get: (_t, prop) => (prop === "getInspector" ? async () => ({ id: 1, name: "Kojo", email: "kojo@example.com", active: true, status: "active" }) : async () => undefined) });
  }
  if (request === "@/lib/staff-auth") {
    const STAFF = { id: 1, name: "Ops One", role: "operations", email: "ops@example.com" };
    return { requireStaffRole: async () => STAFF, getStaff: async () => STAFF };
  }
  if (request.startsWith("@/")) request = path.join(ROOT, "src", request.slice(2));
  return origLoad.call(this, request, parent, isMain);
};
require.extensions[".ts"] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  module._compile(out, filename);
};

const load = (rel) => require(path.join(ROOT, rel));

let passed = 0;
const results = [];
async function t(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log("ok  ", name);
  } catch (err) {
    results.push({ name, err });
    console.log("FAIL", name, "\n     ", err && err.message ? err.message.split("\n").join("\n      ") : err);
  }
}

async function main() {
  // ---- database from the app's own schema
  const ddl = execSync("npx drizzle-kit export --sql", {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: "postgres://u:p@localhost:5432/x" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const pg = new PGlite();
  await pg.exec(ddl);
  const { drizzle } = require("drizzle-orm/pglite");
  const schema = load("src/db/schema.ts");
  const db = drizzle(pg, { schema });
  dbHolder.db = db;
  dbHolder.requireDb = () => db;

  const q = async (text, params) => (await pg.query(text, params)).rows;
  const one = async (text, params) => (await q(text, params))[0];
  const ago = (h) => new Date(Date.now() - h * 3600 * 1000);
  const setSetting = (k, v) => q(`insert into settings (key, value) values ($1,$2) on conflict (key) do update set value = excluded.value`, [k, v]);

  const { maybeAutoAssign, runAutoAssignSweep } = load("src/lib/automation/auto-assign.ts");
  const { triedInspectorIds } = load("src/lib/assignment.ts");
  const { evaluateApproval, recordApprovalCheck, recordApprovalDecision, approvalStats } = load("src/lib/approval-checks.ts");
  const { runAutoApprove } = load("src/lib/automation/auto-approve.ts");
  const { approveJobCore } = load("src/lib/job-approval.ts");
  const { assignJobToInspector } = load("src/lib/assignment.ts");
  const { runOpsDigest } = load("src/lib/automation/ops-digest.ts");
  const { runSchemaCheck, REQUIRED_MIGRATIONS } = load("src/lib/automation/schema-check.ts");

  // ---- seed
  await q(`insert into clients (name, email, password_hash) values ('Acme Oil','acme@example.com','x')`);
  const inspectorNames = ["Kojo", "Ama", "Yaw"];
  for (const n of inspectorNames) await q(`insert into inspectors (name, email, status, active) values ($1,$2,'active',true)`, [n, `${n.toLowerCase()}@example.com`]);
  await q(`insert into inspector_assignment_profiles (inspector_id, regions, service_types, max_open_jobs, auto_assign_enabled) values
    (1, '{Tema}', '{stock_monitoring,quantity_verification}', 3, true),
    (2, '{Takoradi}', '{stock_monitoring,quantity_verification}', 3, true),
    (3, '{Tema}', '{stock_monitoring,quantity_verification}', 3, true)`);
  await q(`insert into staff (name, email, role, status) values ('Ops One','ops@example.com','operations','active')`);
  await setSetting("automation_auto_assign", "1");
  await setSetting("automation_reassign_hours", "24");

  let jobSeq = 0;
  const newJob = async (o = {}) => {
    jobSeq += 1;
    const row = await one(
      `insert into jobs (ref, client_id, service, service_type, location, status, assigned_inspector_id, assigned_at, updated_at)
       values ($1,1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [`T-${jobSeq}`, o.service ?? "Stock Monitoring Services", "serviceType" in o ? o.serviceType : "stock_monitoring", "location" in o ? o.location : "Tema Oil Refinery",
       o.status ?? "awaiting_assignment", o.inspector ?? null, o.assignedAt ?? null, o.updatedAt ?? new Date()],
    );
    return row.id;
  };
  const job = (id) => one(`select * from jobs where id = $1`, [id]);
  const notes = async (id) => (await q(`select note, actor_type, actor_id, status from job_updates where job_id = $1 order by id`, [id]));

  // =========================== AUTO-ASSIGNMENT ===========================
  let jobA;
  await t("auto-assign: picks a qualified local inspector and explains why on the timeline", async () => {
    jobA = await newJob();
    const r = await maybeAutoAssign(jobA);
    assert.equal(r.outcome, "assigned");
    assert.equal(r.inspectorName, "Kojo"); // Kojo and Yaw tie (0 open jobs, no history), Kojo first by name
    const j = await job(jobA);
    assert.equal(j.status, "assigned");
    assert.equal(j.assigned_inspector_id, 1);
    assert.ok(j.assigned_at);
    const n = (await notes(jobA)).find((x) => x.note && x.note.startsWith("Auto-assigned"));
    assert.equal(n.note, "Auto-assigned to Kojo because they cover Tema, are qualified for this service, have 0 of 3 open jobs.");
    assert.equal(n.actor_type, "system");
    assert.equal(n.actor_id, null); // a system row with an actor id would mean "already tried"
  });

  await t("auto-assign: the inspector and the client are both notified", async () => {
    const insp = await q(`select type, recipient_id from notifications where job_id = $1 and recipient_type = 'inspector'`, [jobA]);
    const client = await q(`select type from notifications where job_id = $1 and recipient_type = 'client'`, [jobA]);
    assert.deepEqual(insp.map((r) => [r.type, r.recipient_id]), [["new_assignment", 1]]);
    assert.deepEqual(client.map((r) => r.type), ["inspector_assigned"]);
  });

  await t("auto-assign: the next job goes to the less loaded inspector", async () => {
    const id = await newJob();
    const r = await maybeAutoAssign(id);
    assert.equal(r.outcome, "assigned");
    assert.equal(r.inspectorName, "Yaw"); // Kojo now has 1 open job, Yaw has 0
  });

  await t("auto-assign: does nothing when switched off, and leaves the job untouched", async () => {
    await setSetting("automation_auto_assign", "0");
    const id = await newJob();
    assert.equal((await maybeAutoAssign(id)).outcome, "disabled");
    assert.equal((await job(id)).status, "awaiting_assignment");
    await setSetting("automation_auto_assign", "1");
  });

  await t("auto-assign: no eligible inspector is recorded once, and the job keeps waiting", async () => {
    const id = await newJob({ serviceType: "documentation_reporting" });
    const r1 = await maybeAutoAssign(id);
    assert.equal(r1.outcome, "no_match");
    assert.match(r1.why, /not qualified/);
    await maybeAutoAssign(id);
    const n = (await notes(id)).filter((x) => x.note && x.note.startsWith("Auto-assignment found no eligible inspector"));
    assert.equal(n.length, 1);
    assert.equal((await job(id)).status, "awaiting_assignment");
    // Operations are told straight away, once per job
    const alerts = await q(`select title, body from notifications where recipient_type='staff' and type='auto_assign_no_match' and link = $1`, ["/admin/jobs/" + id]);
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].title, /needs an inspector$/);
    assert.match(alerts[0].body, /couldn't find a suitable inspector/);
  });

  await t("auto-assign: a job with no service type is never guessed at", async () => {
    const id = await newJob({ serviceType: null });
    const r = await maybeAutoAssign(id);
    assert.equal(r.outcome, "no_match");
    assert.match(r.why, /no service type/);
  });

  await t("auto-assign: a declined job is offered to someone else, never back to the decliner", async () => {
    const id = await newJob();
    await maybeAutoAssign(id); // -> whoever is lightest
    const first = (await job(id)).assigned_inspector_id;
    // simulate the inspector declining (what declineAssignment writes)
    await q(`update jobs set status='awaiting_assignment', assigned_inspector_id=null where id=$1`, [id]);
    await q(`insert into job_updates (job_id, status, note, actor_type, actor_id, actor_name) values ($1,'awaiting_assignment','Declined by X: busy','inspector',$2,'X')`, [id, first]);
    assert.deepEqual(await triedInspectorIds(id), [first]);
    const r = await maybeAutoAssign(id);
    assert.equal(r.outcome, "assigned");
    assert.notEqual((await job(id)).assigned_inspector_id, first);
  });

  await t("auto-assign: two people racing for the same job cannot both win", async () => {
    const id = await newJob();
    const mk = (inspectorId) => assignJobToInspector({ jobId: id, inspectorId, actor: { type: "system", id: null, name: "JDL Core" }, note: (n) => `to ${n}` });
    const results2 = await Promise.all([mk(1), mk(3)]);
    assert.equal(results2.filter((r) => r.ok).length, 1, JSON.stringify(results2));
  });

  await t("reassign sweep: an unanswered job stays put when nobody else fits", async () => {
    const id = await newJob({ location: "Takoradi Port", serviceType: "quantity_verification" });
    await maybeAutoAssign(id);
    assert.equal((await job(id)).assigned_inspector_id, 2); // Ama, the only Takoradi inspector
    await q(`update jobs set assigned_at=$2, updated_at=$2 where id=$1`, [id, ago(30)]);
    const out = await runAutoAssignSweep();
    assert.equal(out.reassigned, 0);
    assert.equal((await job(id)).assigned_inspector_id, 2);
    globalThis.__takoradiJob = id;
  });

  await t("reassign sweep: moves it to the next eligible inspector, marks the first as tried, and tells them", async () => {
    const id = globalThis.__takoradiJob;
    await q(`insert into inspectors (name, email, status, active) values ('Kofi','kofi@example.com','active',true)`);
    await q(`insert into inspector_assignment_profiles (inspector_id, regions, service_types, max_open_jobs, auto_assign_enabled) values (4,'{Takoradi}','{quantity_verification}',3,true)`);
    const out = await runAutoAssignSweep();
    assert.equal(out.reassigned, 1);
    assert.equal((await job(id)).assigned_inspector_id, 4);
    const n = await notes(id);
    assert.ok(n.some((x) => x.note && x.note.startsWith("Auto-reassigned from Ama: no response within 24 hours")));
    assert.ok(n.some((x) => x.note && x.note.startsWith("Auto-assigned to Kofi because")));
    assert.ok((await triedInspectorIds(id)).includes(2));
    const old = await q(`select type from notifications where job_id=$1 and recipient_type='inspector' and recipient_id=2 order by id`, [id]);
    assert.ok(old.some((r) => r.type === "assignment_reassigned"));
  });

  await t("reassign sweep: a freshly assigned job is not touched", async () => {
    const id = globalThis.__takoradiJob; // just reassigned, assigned_at is now
    const before = (await job(id)).assigned_inspector_id;
    const out = await runAutoAssignSweep();
    assert.equal(out.reassigned, 0);
    assert.equal((await job(id)).assigned_inspector_id, before);
  });

  // =========================== APPROVAL ===========================
  // A finished, clean job for Kojo, plus a history of clean approved jobs for the track-record check.
  const prior = [];
  for (let i = 0; i < 5; i++) {
    const id = await newJob({ status: "closed", inspector: 1 });
    await q(`update jobs set approved_at = $2 where id = $1`, [id, ago(200 - i * 10)]);
    prior.push(id);
  }
  await setSetting("automation_approval_service_types", "stock_monitoring");
  await setSetting("automation_approval_min_clean_jobs", "5");
  await setSetting("automation_approval_hold_hours", "4");

  const readyJob = async (o = {}) => {
    const id = await newJob({ status: "awaiting_approval", inspector: o.inspector ?? 1, serviceType: o.serviceType ?? "stock_monitoring" });
    const submitted = o.submittedAt ?? new Date();
    await q(
      `insert into job_completion_data (job_id, date_time_started, date_time_completed, gov, gsv, metric_tonnes_air, metric_tonnes_vacuum, submitted_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, ago(30), ago(26), o.gov ?? "1000", o.gsv ?? "985", "830", "831", submitted],
    );
    if (o.report !== false) await q(`insert into documents (job_id, kind, title, url) values ($1,'report','Report','https://x')`, [id]);
    if (o.aiReview !== false) await q(`insert into ai_reviews (job_id, target_type, severity, summary, provider, created_at) values ($1,'completion_data','none','','test',$2)`, [id, new Date(submitted.getTime() + 1000)]);
    return id;
  };
  const failing = (ev) => ev.checks.filter((c) => !c.ok).map((c) => c.key);

  await setSetting("automation_approval_mode", "shadow");

  await t("checks: a complete, consistent, reviewed job with a clean inspector passes everything", async () => {
    const id = await readyJob();
    const ev = await evaluateApproval(id);
    assert.deepEqual(failing(ev), [], JSON.stringify(ev.checks.filter((c) => !c.ok)));
    assert.equal(ev.verdict, "pass");
    assert.equal(ev.checks.length, 9);
  });

  await t("checks: each requirement fails on its own, for the right reason", async () => {
    assert.deepEqual(failing(await evaluateApproval(await readyJob({ report: false }))), ["report_attached"]);
    assert.deepEqual(failing(await evaluateApproval(await readyJob({ aiReview: false }))), ["ai_review_ran"]);
    assert.deepEqual(failing(await evaluateApproval(await readyJob({ gsv: "800" }))), ["numbers_reconcile"]);
    assert.deepEqual(failing(await evaluateApproval(await readyJob({ serviceType: "quantity_verification" }))), ["service_allowed"]);
    // an AI flag on any document blocks it
    const flagged = await readyJob();
    await q(`insert into ai_reviews (job_id, target_type, target_id, severity, summary, provider) values ($1,'document',1,'medium','looks altered','test')`, [flagged]);
    assert.deepEqual(failing(await evaluateApproval(flagged)), ["no_ai_flags"]);
    // an amended resubmission always needs a person
    const resub = await readyJob();
    await q(`insert into job_updates (job_id, status, note, actor_type, actor_name) values ($1,'rejected_amendment','fix it','staff','Ops')`, [resub]);
    assert.deepEqual(failing(await evaluateApproval(resub)), ["first_submission"]);
  });

  await t("checks: an inspector with a job that was sent back, or too few jobs, does not qualify", async () => {
    await q(`insert into job_updates (job_id, status, note, actor_type, actor_name) values ($1,'rejected_amendment','redo','staff','Ops')`, [prior[4]]);
    const id = await readyJob();
    assert.deepEqual(failing(await evaluateApproval(id)), ["inspector_record"]);
    await q(`delete from job_updates where job_id=$1 and status='rejected_amendment'`, [prior[4]]);
    // Yaw (id 3) has no approved history at all
    const newbie = await readyJob({ inspector: 3 });
    const ev = await evaluateApproval(newbie);
    assert.deepEqual(failing(ev), ["inspector_record"]);
    assert.match(ev.checks.find((c) => c.key === "inspector_record").detail, /Only 0 of 5/);
  });

  let jobF;
  await t("shadow mode: records the verdict and never approves anything", async () => {
    jobF = await readyJob();
    await recordApprovalCheck(jobF);
    const row = await one(`select mode, verdict, human_decision from job_approval_checks where job_id=$1`, [jobF]);
    assert.deepEqual([row.mode, row.verdict, row.human_decision], ["shadow", "pass", null]);
    await recordApprovalCheck(jobF); // submitting twice must not create a second row
    assert.equal((await q(`select 1 from job_approval_checks where job_id=$1`, [jobF])).length, 1);
    const out = await runAutoApprove();
    assert.equal(out.approved, 0);
    assert.equal((await job(jobF)).status, "awaiting_approval");
  });

  await t("automatic mode: a passing job waits out the hold window, then is approved with a certificate", async () => {
    await setSetting("automation_approval_mode", "auto");
    let out = await runAutoApprove();
    assert.equal(out.held, 1, JSON.stringify(out)); // recorded just now, hold is 4 hours
    assert.equal((await job(jobF)).status, "awaiting_approval");

    await q(`update job_approval_checks set created_at = $2 where job_id = $1`, [jobF, ago(5)]);
    out = await runAutoApprove();
    assert.equal(out.approved, 1, JSON.stringify(out));

    const j = await job(jobF);
    assert.equal(j.status, "invoice_issued"); // approved -> report issued -> invoice issued, as the manual path does
    assert.equal(j.approved_by_staff_id, null);
    assert.ok(j.approved_at);
    const cert = await one(`select coq_number, issued_by_staff_id from certificates where job_id=$1`, [jobF]);
    assert.match(cert.coq_number, /^COQ-\d{4}-\d{4}$/);
    assert.equal(cert.issued_by_staff_id, null);
    const n = (await notes(jobF)).find((x) => x.note && x.note.startsWith("Auto-approved"));
    assert.match(n.note, /^Auto-approved: all 9 checks passed \(/);
    assert.equal(n.actor_type, "system");
    const row = await one(`select human_decision from job_approval_checks where job_id=$1`, [jobF]);
    assert.equal(row.human_decision, "auto_approved");
    const clientNote = await q(`select type from notifications where job_id=$1 and recipient_type='client'`, [jobF]);
    assert.ok(clientNote.some((r) => r.type === "report_approved"));
  });

  await t("automatic mode: running again approves nothing twice", async () => {
    const out = await runAutoApprove();
    assert.equal(out.approved, 0);
    assert.equal((await q(`select 1 from certificates where job_id=$1`, [jobF])).length, 1);
  });

  await t("automatic mode: a job whose checks failed is never approved, however long it waits", async () => {
    const id = await readyJob({ report: false });
    await recordApprovalCheck(id);
    await q(`update job_approval_checks set created_at = $2 where job_id = $1`, [id, ago(100)]);
    const out = await runAutoApprove();
    assert.equal(out.approved, 0);
    assert.equal((await job(id)).status, "awaiting_approval");
  });

  await t("automatic mode: a job that stops passing before approval is not approved", async () => {
    const id = await readyJob();
    await recordApprovalCheck(id);
    await q(`update job_approval_checks set created_at = $2 where job_id = $1`, [id, ago(100)]);
    await q(`insert into ai_reviews (job_id, target_type, severity, summary, provider) values ($1,'completion_data','high','odd figure','test')`, [id]); // flagged after submission
    const out = await runAutoApprove();
    assert.equal(out.approved, 0);
    assert.equal((await job(id)).status, "awaiting_approval");
  });

  await t("automatic mode: a person who already decided is not overridden", async () => {
    const id = await readyJob();
    await recordApprovalCheck(id);
    await q(`update job_approval_checks set created_at = $2 where job_id = $1`, [id, ago(100)]);
    await recordApprovalDecision(id, "rejected");
    const out = await runAutoApprove();
    assert.equal(out.approved, 0);
    assert.equal((await job(id)).status, "awaiting_approval");
  });

  await t("approval: the shared approve function refuses a job that isn't awaiting approval", async () => {
    const r = await approveJobCore({ jobId: jobF, actor: { type: "staff", id: 1, name: "Ops One" } });
    assert.equal(r.ok, false);
    assert.match(r.reason, /isn't awaiting approval/);
  });

  await t("approval: a staff approval still works and is attributed to the person", async () => {
    const id = await readyJob({ report: false }); // fails the checks, but a person can always approve
    const r = await approveJobCore({ jobId: id, actor: { type: "staff", id: 1, name: "Ops One" } });
    assert.equal(r.ok, true);
    const j = await job(id);
    assert.equal(j.approved_by_staff_id, 1);
    const n = (await notes(id)).find((x) => x.status === "approved");
    assert.equal(n.note, "Approved by Ops One.");
  });

  await t("shadow results: agreement with the human decisions is counted correctly", async () => {
    await setSetting("automation_approval_mode", "shadow");
    const baseline = await approvalStats(); // earlier tests in this run also recorded decisions
    const a = await readyJob(); await recordApprovalCheck(a); await recordApprovalDecision(a, "approved");           // pass + approved
    const b = await readyJob(); await recordApprovalCheck(b); await recordApprovalDecision(b, "rejected");           // pass + rejected (dangerous)
    const c = await readyJob({ report: false }); await recordApprovalCheck(c); await recordApprovalDecision(c, "approved"); // fail + approved
    const after = await approvalStats();
    assert.deepEqual(
      {
        decided: after.decided - baseline.decided,
        agreedPass: after.agreedPass - baseline.agreedPass,
        passButRejected: after.passButRejected - baseline.passButRejected,
        failButApproved: after.failButApproved - baseline.failButApproved,
      },
      { decided: 3, agreedPass: 1, passButRejected: 1, failButApproved: 1 },
    );
  });


  // =========================== THE ADMIN SCREENS' ACTIONS ===========================
  // Earlier tests filled Kojo's and Yaw's job limits on purpose; give them room for the screens' tests.
  await q(`update inspector_assignment_profiles set max_open_jobs = 30 where inspector_id in (1, 3)`);
  const wf = load("src/app/actions/job-workflow.ts");
  const pa = load("src/app/actions/portal-admin.ts");
  const fd = (o) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, String(v)); return f; };
  const empty = { ok: false, message: "" };

  await t("Create job: the service comes from the list, the job is typed and auto-assigned", async () => {
    const r = await pa.createJob(empty, fd({ clientId: 1, serviceType: "stock_monitoring", location: "Tema Depot 3" }));
    assert.equal(r.ok, true, r.message);
    const j = await one(`select * from jobs order by id desc limit 1`);
    assert.equal(j.service, "Stock Monitoring Services");
    assert.equal(j.service_type, "stock_monitoring");
    assert.equal(j.status, "assigned");
    assert.match((await notes(j.id)).find((x) => x.note && x.note.startsWith("Auto-assigned")).note, /because they cover Tema/);
  });

  await t("Create job: a service that isn't in the list is refused", async () => {
    const r = await pa.createJob(empty, fd({ clientId: 1, serviceType: "made_up" }));
    assert.equal(r.ok, false);
    assert.equal(r.message, "Pick a service from the list.");
  });

  await t("Convert quote: uses the chosen service, creates the client, types the job and auto-assigns it", async () => {
    const sub = await one(`insert into submissions (type, name, email, phone, service) values ('quote','Efua Mensah','efua@example.com','0240000000','Stock Monitoring') returning id`);
    const r = await pa.convertQuoteToJob({ ok: false, message: "" }, fd({
      submissionId: sub.id, mode: "new", name: "Efua Mensah", email: "efua@example.com", phone: "0240000000",
      serviceType: "stock_monitoring", location: "Takoradi Harbour",
    }));
    assert.equal(r.ok, true, r.message);
    const j = await job(r.jobId);
    assert.equal(j.service_type, "stock_monitoring");
    assert.equal(j.service, "Stock Monitoring Services");
    assert.equal(j.status, "assigned");
    assert.equal(j.assigned_inspector_id, 2, "Takoradi job should go to Ama"); // Ama covers Takoradi and has capacity
    assert.equal((await one(`select converted_job_id from submissions where id=$1`, [sub.id])).converted_job_id, r.jobId);
    const again = await pa.convertQuoteToJob({ ok: false, message: "" }, fd({
      submissionId: sub.id, mode: "new", name: "Efua Mensah", email: "efua@example.com", serviceType: "stock_monitoring",
    }));
    assert.equal(again.ok, false);
    assert.match(again.message, /already converted/);
  });

  await t("Convert quote: a service that isn't in the list is refused", async () => {
    const sub = await one(`insert into submissions (type, name, email, service) values ('quote','X Y','xy@example.com','Not sure yet') returning id`);
    const r = await pa.convertQuoteToJob({ ok: false, message: "" }, fd({ submissionId: sub.id, mode: "new", name: "X Y", email: "xy@example.com", serviceType: "nope" }));
    assert.equal(r.ok, false);
    assert.equal(r.message, "Pick a service from the list.");
  });

  await t("Edit job details: sets the missing service type and location, records it, and auto-assigns", async () => {
    const id = await newJob({ serviceType: null, location: null, service: "Stock Monitoring" });
    const r = await wf.updateJobDetails(empty, fd({ jobId: id, serviceType: "stock_monitoring", location: "Tema, Tank Farm B", tankOrDepot: "" }));
    assert.equal(r.ok, true, r.message);
    assert.match(r.message, /^Job details saved\. Assigned automatically to /);
    const j = await job(id);
    assert.equal(j.service_type, "stock_monitoring");
    assert.equal(j.location, "Tema, Tank Farm B");
    assert.equal(j.status, "assigned");
    const n = (await notes(id)).find((x) => x.note && x.note.startsWith("Details updated by Ops One"));
    assert.equal(n.note, "Details updated by Ops One: service type set to Stock Monitoring Services; location set to Tema, Tank Farm B.");
    assert.equal(n.actor_type, "staff");
  });

  await t("Edit job details: saving without changes says so, and a bad service or a closed job is refused", async () => {
    const id = await newJob({ serviceType: "stock_monitoring", location: "Tema", status: "assigned", inspector: 1 });
    assert.equal((await wf.updateJobDetails(empty, fd({ jobId: id, serviceType: "stock_monitoring", location: "Tema", tankOrDepot: "" }))).message, "Nothing to change.");
    assert.equal((await wf.updateJobDetails(empty, fd({ jobId: id, serviceType: "made_up", location: "Tema" }))).message, "Pick a service from the list.");
    const closed = await newJob({ status: "closed" });
    assert.match((await wf.updateJobDetails(empty, fd({ jobId: closed, serviceType: "stock_monitoring" }))).message, /closed/);
  });

  await t("Edit job details: an unmatched job explains why it is still waiting", async () => {
    const id = await newJob({ serviceType: null, location: null });
    const r = await wf.updateJobDetails(empty, fd({ jobId: id, serviceType: "documentation_reporting", location: "Tema" }));
    assert.equal(r.ok, true);
    assert.match(r.message, /No inspector matched automatically \(.*not qualified.*\), so it's waiting for you to assign\./);
    assert.equal((await job(id)).status, "awaiting_assignment");
  });

  await t("Assign button: still works by hand and is attributed to the person", async () => {
    const id = await newJob({ serviceType: "documentation_reporting" }); // nobody auto-qualifies
    const r = await wf.assignInspector(empty, fd({ jobId: id, inspectorId: 2 }));
    assert.equal(r.ok, true, r.message);
    assert.equal(r.message, "Job assigned.");
    const n = (await notes(id)).find((x) => x.status === "assigned");
    assert.equal(n.note, "Assigned to Ama.");
    assert.equal(n.actor_type, "staff");
    const re = await wf.assignInspector(empty, fd({ jobId: id, inspectorId: 1 }));
    assert.equal(re.message, "Job reassigned.");
  });

  await t("Approve and Return buttons: work by hand and feed the shadow comparison", async () => {
    await setSetting("automation_approval_mode", "shadow");
    const a = await readyJob();
    await recordApprovalCheck(a);
    const ra = await wf.approveJob(empty, fd({ jobId: a }));
    assert.equal(ra.ok, true, ra.message);
    assert.equal((await job(a)).status, "invoice_issued");
    assert.equal((await one(`select human_decision from job_approval_checks where job_id=$1`, [a])).human_decision, "approved");
    assert.equal((await one(`select approved_by_staff_id from jobs where id=$1`, [a])).approved_by_staff_id, 1);

    const b = await readyJob();
    await recordApprovalCheck(b);
    const rb = await wf.rejectJob(empty, fd({ jobId: b, comment: "Please re-check tank 4" }));
    assert.equal(rb.ok, true, rb.message);
    assert.equal((await job(b)).status, "rejected_amendment");
    assert.equal((await one(`select human_decision from job_approval_checks where job_id=$1`, [b])).human_decision, "rejected");
  });


  // =========================== THE ITEMS ADDED LAST ===========================
  await t("report rule: when not required, a job without a report can still pass; when required it cannot", async () => {
    await setSetting("automation_approval_mode", "auto");
    await setSetting("automation_approval_require_report", "0");
    const ev = await evaluateApproval(await readyJob({ report: false }));
    assert.deepEqual(failing(ev), []);
    assert.equal(ev.checks.find((c) => c.key === "report_attached").detail, "Not required by your settings.");
    await setSetting("automation_approval_require_report", "1");
    assert.deepEqual(failing(await evaluateApproval(await readyJob({ report: false }))), ["report_attached"]);
  });

  await t("inspector availability: setting away stops automatic assignment, and back makes them eligible again", async () => {
    const ia = load("src/app/actions/inspector.ts");
    const future = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const r = await ia.setMyAvailability(empty, fd({ awayUntil: future }));
    assert.equal(r.ok, true, r.message);
    assert.match(r.message, /^Marked as away until /);
    const p = await one(`select unavailable_until from inspector_assignment_profiles where inspector_id = 1`);
    assert.equal(p.unavailable_until.toISOString().slice(0, 10), future);

    const id = await newJob({ location: "Tema Terminal" });
    const auto = await maybeAutoAssign(id);
    assert.equal(auto.outcome, "assigned");
    assert.notEqual((await job(id)).assigned_inspector_id, 1, "Kojo is away and must not be picked");

    const back = await ia.setMyAvailability(empty, fd({ back: "1" }));
    assert.equal(back.message, "You're available for new assignments.");
    assert.equal((await one(`select unavailable_until from inspector_assignment_profiles where inspector_id = 1`)).unavailable_until, null);
  });

  await t("inspector availability: a past date or no date is refused", async () => {
    const ia = load("src/app/actions/inspector.ts");
    assert.match((await ia.setMyAvailability(empty, fd({ awayUntil: "2020-01-01" }))).message, /future/);
    assert.equal((await ia.setMyAvailability(empty, fd({}))).message, "Pick the date you will be back.");
  });

  await t("inspector availability: works for an inspector who has no profile yet, without switching auto-assign on", async () => {
    await q(`insert into inspectors (name, email, status, active) values ('Newbie','newbie@example.com','active',true)`);
    const newId = (await one(`select id from inspectors where email='newbie@example.com'`)).id;
    await q(`delete from inspector_assignment_profiles where inspector_id = $1`, [newId]);
    // stub getInspector returns Kojo (id 1), so exercise the same upsert path directly for a profile-less inspector
    const { inspectorAssignmentProfiles } = load("src/db/schema.ts");
    await dbHolder.requireDb().insert(inspectorAssignmentProfiles).values({ inspectorId: newId, unavailableUntil: null }).onConflictDoUpdate({ target: inspectorAssignmentProfiles.inspectorId, set: { unavailableUntil: null } });
    const row = await one(`select auto_assign_enabled, regions, service_types from inspector_assignment_profiles where inspector_id=$1`, [newId]);
    assert.equal(row.auto_assign_enabled, false);
    assert.deepEqual(row.service_types, []);
  });

  await t("job title: Create job can set a custom title, and defaults to the service name", async () => {
    const custom = await pa.createJob(empty, fd({ clientId: 1, serviceType: "stock_monitoring", title: "Q3 audit, Tema depot", location: "Tema" }));
    assert.equal(custom.ok, true, custom.message);
    const a = await one(`select service, service_type from jobs order by id desc limit 1`);
    assert.deepEqual([a.service, a.service_type], ["Q3 audit, Tema depot", "stock_monitoring"]);
    await pa.createJob(empty, fd({ clientId: 1, serviceType: "stock_monitoring", title: "", location: "Tema" }));
    assert.equal((await one(`select service from jobs order by id desc limit 1`)).service, "Stock Monitoring Services");
  });

  await t("job title: editing details changes the title, a blank title keeps it, and it is recorded", async () => {
    const id = await newJob({ service: "Old title", status: "assigned", inspector: 1 });
    const r = await wf.updateJobDetails(empty, fd({ jobId: id, title: "New title", serviceType: "stock_monitoring", location: "Tema Oil Refinery", tankOrDepot: "" }));
    assert.equal(r.ok, true, r.message);
    assert.equal((await job(id)).service, "New title");
    assert.match((await notes(id)).find((x) => x.note && x.note.startsWith("Details updated")).note, /title set to New title/);
    await wf.updateJobDetails(empty, fd({ jobId: id, title: "", serviceType: "stock_monitoring", location: "Tema Oil Refinery", tankOrDepot: "" }));
    assert.equal((await job(id)).service, "New title");
  });

  await t("hourly route: refuses without the secret, and runs the three time-sensitive tasks with it", async () => {
    const route = load("src/app/api/cron/hourly/route.ts");
    process.env.CRON_SECRET = "test-secret";
    const denied = await route.GET(new Request("http://x/api/cron/hourly"));
    assert.equal(denied.status, 401);
    const wrong = await route.GET(new Request("http://x/api/cron/hourly", { headers: { authorization: "Bearer nope" } }));
    assert.equal(wrong.status, 401);
    const ok = await route.GET(new Request("http://x/api/cron/hourly", { headers: { authorization: "Bearer test-secret" } }));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(ok.body.tasks.map((x) => x.name), ["auto-assign", "auto-approve", "email-retry"]);
    assert.ok(ok.body.tasks.every((x) => x.ok));
    delete process.env.CRON_SECRET;
  });

  await t("service list: the quote form and screens use the active services and their current names", async () => {
    const { listServiceOptions } = load("src/lib/service-options.ts");
    const fallback = await listServiceOptions();
    assert.equal(fallback.length, 10); // services table empty: built-in list
    await q(`insert into services (key, label, active, position) values ('stock_monitoring','Stock Monitoring (renamed)',true,1), ('inventory_audit','Inventory Audit Support',true,2), ('quantity_verification','Quantity Verification',false,3)`);
    const live = await listServiceOptions();
    assert.deepEqual(live.map((o) => o.label), ["Stock Monitoring (renamed)", "Inventory Audit Support"]);
    const { matchServiceKey } = load("src/lib/service-match.ts");
    assert.equal(matchServiceKey("Stock Monitoring (renamed)", live), "stock_monitoring");
    await q(`delete from services`);
  });


  // =========================== THE AUTOMATIONS PAGE ===========================
  const { recordRuns } = load("src/lib/automation/run.ts");
  const { loadAutomationOverview } = load("src/lib/automation/overview.ts");
  const card = (ov, id) => [...ov.scheduled, ...ov.event].find((c) => c.id === id);

  await t("automations page: the hourly route records its runs", async () => {
    const route = load("src/app/api/cron/hourly/route.ts");
    process.env.CRON_SECRET = "test-secret";
    await route.GET(new Request("http://x/api/cron/hourly", { headers: { authorization: "Bearer test-secret" } }));
    delete process.env.CRON_SECRET;
    const rows = await q(`select task, source, ok from automation_runs where source = 'hourly' order by id`);
    assert.deepEqual(rows.map((r) => r.task).slice(-3), ["auto-assign", "auto-approve", "email-retry"]);
    assert.ok(rows.every((r) => r.ok));
  });

  await t("automations page: shows when each ran, in plain words, and calls the healthy ones healthy", async () => {
    await q(`delete from automation_runs`);
    await recordRuns("daily", [
      { name: "invoice-reminders", ok: true, ms: 40, result: { dueSoon: 2, overdue7: 1, overdue14: 0, overdueFlagged: 1 } },
      { name: "ops-digest", ok: true, ms: 90, result: { itemsListed: 0, sections: 0, inspectorNudges: 0 } },
      { name: "schema-check", ok: false, ms: 3, error: "Database is behind the code" },
    ]);
    const ov = await loadAutomationOverview();
    assert.equal(ov.historyAvailable, true);
    const inv = card(ov, "invoice-reminders");
    assert.equal(inv.health, "healthy");
    assert.equal(inv.lastRunText, "just now");
    assert.equal(inv.lastResult, "Sent 4 reminders.");
    assert.equal(inv.state, "always");
    assert.equal(card(ov, "morning-summary").lastResult, "Nothing needed attention.");
    // the developer-only schema check never appears on the page
    assert.equal([...ov.scheduled, ...ov.event].some((c) => /schema/i.test(c.name + c.id)), false);
    // an automation that has never run says so instead of pretending
    assert.equal(card(ov, "close-finished-jobs").health, "waiting");
    assert.equal(card(ov, "close-finished-jobs").lastRunText, "Not run yet");
  });

  await t("automations page: a failed run and a late run are flagged, and counted as needing a look", async () => {
    await q(`delete from automation_runs`);
    await recordRuns("daily", [{ name: "auto-close", ok: false, ms: 5, error: "boom" }]);
    await q(`insert into automation_runs (source, task, ok, ms, started_at) values ('daily','ops-digest',true,10, now() - interval '40 hours')`);
    const ov = await loadAutomationOverview();
    assert.equal(card(ov, "close-finished-jobs").health, "failed");
    assert.equal(card(ov, "close-finished-jobs").lastResult, "The last run didn't finish. It will try again on its next run.");
    assert.equal(card(ov, "morning-summary").health, "late");
    assert.equal(ov.needsAttention, 2);
    // the raw error text is never shown to the team
    assert.equal(JSON.stringify(ov).includes("boom"), false);
  });

  await t("automations page: hourly ones are hourly once the hourly schedule has been seen, and off ones are never 'late'", async () => {
    await q(`delete from automation_runs`);
    await q(`insert into automation_runs (source, task, ok, ms, summary, started_at) values ('hourly','auto-approve',true,5,'{"mode":"auto","approved":1}', now() - interval '10 minutes'), ('hourly','auto-assign',true,5,'{"enabled":true,"assigned":0,"reassigned":0,"unmatched":0}', now() - interval '5 hours')`);
    await setSetting("automation_approval_mode", "auto");
    await setSetting("automation_auto_assign", "1");
    let ov = await loadAutomationOverview();
    assert.equal(card(ov, "approval-sweep").when, "Every hour");
    assert.equal(card(ov, "approval-sweep").health, "healthy");
    assert.equal(card(ov, "approval-sweep").lastResult, "Approved 1 job.");
    assert.equal(card(ov, "assignment-sweep").health, "late"); // 5 hours with an hourly schedule in use
    await setSetting("automation_auto_assign", "0");
    await setSetting("automation_approval_mode", "shadow");
    ov = await loadAutomationOverview();
    assert.equal(card(ov, "assignment-sweep").state, "off");
    assert.equal(card(ov, "assignment-sweep").health, "healthy"); // switched off is not a problem
    assert.equal(card(ov, "approval-sweep").state, "shadow");
    assert.equal(card(ov, "approval-sweep").stateLabel, "Watching only");
    await setSetting("automation_auto_assign", "1");
  });

  await t("automations page: recent automatic activity and the tally are shown, linked to the jobs", async () => {
    const ov = await loadAutomationOverview();
    assert.ok(ov.activity.length > 0);
    assert.ok(ov.activity.every((a) => a.ref && a.jobId && a.text && a.when));
    assert.ok(ov.activity.some((a) => a.text.startsWith("Assigned to ")));
    assert.ok(ov.activity.some((a) => a.text.startsWith("Approved automatically:")));
    const labels = ov.counts.map((c) => c.label);
    assert.ok(labels.includes("Jobs assigned to an inspector"));
    assert.ok(labels.includes("Jobs approved automatically"));
    assert.ok(labels.includes("\"Needs an inspector\" alerts"));
  });

  await t("automations page: the daily run prunes history older than 30 days", async () => {
    await q(`insert into automation_runs (source, task, ok, ms, started_at) values ('daily','old-task',true,1, now() - interval '40 days')`);
    await recordRuns("daily", []);
    assert.equal((await q(`select 1 from automation_runs where task = 'old-task'`)).length, 0);
  });

  await t("automations page: still works, saying so plainly, when no history has been recorded yet", async () => {
    await q(`alter table automation_runs rename to automation_runs_hidden`);
    try {
      await recordRuns("daily", [{ name: "auto-close", ok: true, ms: 1, result: { closed: 0 } }]); // must not throw
      const ov = await loadAutomationOverview();
      assert.equal(ov.historyAvailable, false);
      assert.equal(card(ov, "close-finished-jobs").lastRunText, "Not recorded yet");
      assert.ok(ov.event.length > 0 && ov.scheduled.length > 0);
    } finally {
      await q(`alter table automation_runs_hidden rename to automation_runs`);
    }
  });

  // =========================== DIGEST + SCHEMA CHECK ===========================
  await t("daily digest: runs, and reports automatic actions to Operations", async () => {
    await runOpsDigest();
    const n = await q(`select title, body from notifications where recipient_type='staff' and type='ops_digest' order by id desc limit 1`);
    assert.ok(n[0], "no digest notification");
    assert.match(n[0].body, /Approved automatically in the last 24 hours/);
    assert.match(n[0].body, /Assigned automatically in the last 24 hours/);
  });

  await t("schema check: fails (developer-only) when a required migration is missing, passes when complete", async () => {
    await q(`delete from schema_migrations`);
    await q(`insert into schema_migrations (name) values ('0001_schema_migrations')`);
    await assert.rejects(() => runSchemaCheck(), /Database is behind the code/);
    for (const name of REQUIRED_MIGRATIONS) await q(`insert into schema_migrations (name) values ($1) on conflict do nothing`, [name]);
    const ok = await runSchemaCheck();
    assert.equal(ok.behind, false);
  });

  console.log(`\n${passed} passed, ${results.length} failed`);
  process.exit(results.length ? 1 : 0);
}

main().catch((err) => {
  console.error("Test harness error:", err);
  process.exit(2);
});
