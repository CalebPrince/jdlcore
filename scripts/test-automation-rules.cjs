const ts = require("typescript");
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

function load(file) {
  const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: "ES2022" } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", "require", out)(m, m.exports, require);
  return m.exports;
}
const { chooseInspector } = load("src/lib/assignment-rules.ts");
const { checkRequired, checkReconcile } = load("src/lib/approval-rules.ts");
const { matchServiceKey } = load("src/lib/service-match.ts");
const catalog = load("src/lib/automation/catalog.ts");

let n = 0;
const t = (name, fn) => { fn(); n += 1; console.log("ok  ", name); };

const now = new Date("2026-09-22T08:00:00Z");
const job = { serviceType: "stock_monitoring", location: "Tema Oil Refinery, Accra", tankOrDepot: null, requestedDate: null };
const insp = (id, name, o = {}) => ({ id, name, regions: ["Tema"], serviceTypes: ["stock_monitoring"], maxOpenJobs: 3, unavailableUntil: null, ...o });
const none = new Map();

// ---- assignment
t("job without a service type is never auto-assigned", () => {
  const r = chooseInspector({ ...job, serviceType: null }, [insp(1, "A")], none, none, [], now);
  assert.equal(r.found, false); assert.match(r.why, /no service type/);
});
t("no eligible-for-auto inspectors gives a clear reason", () => {
  const r = chooseInspector(job, [], none, none, [], now);
  assert.equal(r.found, false); assert.match(r.why, /switched on/);
});
t("matches on service and region, and explains why", () => {
  const r = chooseInspector(job, [insp(1, "Kojo")], none, none, [], now);
  assert.equal(r.found, true); assert.equal(r.inspectorId, 1); assert.equal(r.reason, "cover Tema, are qualified for this service, have 0 of 3 open jobs");
});
t("region is case-insensitive and matches inside the location text", () => {
  const r = chooseInspector({ ...job, location: "TEMA harbour" }, [insp(1, "Kojo", { regions: ["tema"] })], none, none, [], now);
  assert.equal(r.found, true);
});
t("not qualified for the service is excluded", () => {
  const r = chooseInspector(job, [insp(1, "A", { serviceTypes: ["inventory_audit"] })], none, none, [], now);
  assert.equal(r.found, false); assert.match(r.why, /not qualified/);
});
t("outside their region is excluded", () => {
  const r = chooseInspector(job, [insp(1, "A", { regions: ["Takoradi"] })], none, none, [], now);
  assert.equal(r.found, false); assert.match(r.why, /outside this location/);
});
t("an inspector with no regions covers any location, but a local match beats them", () => {
  const anywhere = insp(1, "Anywhere", { regions: [] });
  const local = insp(2, "Local");
  assert.equal(chooseInspector(job, [anywhere], none, none, [], now).found, true);
  assert.equal(chooseInspector(job, [anywhere, local], none, none, [], now).inspectorId, 2);
});
t("at their open-job limit is excluded", () => {
  const r = chooseInspector(job, [insp(1, "A", { maxOpenJobs: 2 })], new Map([[1, 2]]), none, [], now);
  assert.equal(r.found, false); assert.match(r.why, /job limit/);
});
t("lighter load (relative to limit) wins", () => {
  const r = chooseInspector(job, [insp(1, "A", { maxOpenJobs: 4 }), insp(2, "B", { maxOpenJobs: 4 })], new Map([[1, 3], [2, 1]]), none, [], now);
  assert.equal(r.inspectorId, 2);
});
t("equal load: more history with the client wins, then name", () => {
  const two = [insp(1, "Zed"), insp(2, "Amy")];
  assert.equal(chooseInspector(job, two, none, new Map([[1, 4]]), [], now).inspectorId, 1);
  assert.equal(chooseInspector(job, two, none, none, [], now).inspectorId, 2);
});
t("away past the needed date is excluded; back before a future requested date is fine", () => {
  const away = insp(1, "A", { unavailableUntil: new Date("2026-09-30T00:00:00Z") });
  assert.equal(chooseInspector(job, [away], none, none, [], now).found, false);
  const future = { ...job, requestedDate: new Date("2026-10-05T00:00:00Z") };
  assert.equal(chooseInspector(future, [away], none, none, [], now).found, true);
});
t("inspectors who already declined or timed out are skipped", () => {
  const r = chooseInspector(job, [insp(1, "A"), insp(2, "B")], none, none, [1], now);
  assert.equal(r.inspectorId, 2);
  const only = chooseInspector(job, [insp(1, "A")], none, none, [1], now);
  assert.equal(only.found, false); assert.match(only.why, /already tried/);
});

// ---- approval figures
const good = { gov: 1000, gsv: 985, air: 830, vacuum: 831, started: new Date("2026-09-20T08:00Z"), finished: new Date("2026-09-20T14:00Z") };
t("complete, consistent figures pass both checks", () => {
  assert.equal(checkRequired(good).ok, true); assert.equal(checkReconcile(good).ok, true);
});
t("a missing figure fails the required check and names it", () => {
  const r = checkRequired({ ...good, gsv: null, finished: null });
  assert.equal(r.ok, false); assert.match(r.detail, /GSV/); assert.match(r.detail, /completion time/);
  assert.equal(checkReconcile({ ...good, gsv: null }).ok, false);
});
t("GSV far from GOV fails (likely a typo)", () => {
  const r = checkReconcile({ ...good, gsv: 850 });
  assert.equal(r.ok, false); assert.match(r.detail, /GSV is 85\.0% of GOV/);
});
t("air and vacuum tonnes more than 1% apart fails; within 1% passes", () => {
  assert.equal(checkReconcile({ ...good, air: 800, vacuum: 831 }).ok, false);
  assert.equal(checkReconcile({ ...good, air: 826, vacuum: 831 }).ok, true);
});
t("zero or negative figures fail", () => {
  assert.equal(checkReconcile({ ...good, gov: 0 }).ok, false);
  assert.equal(checkReconcile({ ...good, air: -5 }).ok, false);
});
t("completion before start fails", () => {
  const r = checkReconcile({ ...good, started: good.finished, finished: good.started });
  assert.equal(r.ok, false); assert.match(r.detail, /before the start/);
});

// ---- service name matching (public forms vs the services table)
const OPTIONS = [
  ["stock_monitoring", "Stock Monitoring Services"],
  ["collateral_verification", "Collateral Verification Services"],
  ["tank_depot_inspection", "Tank and Depot Inspections"],
  ["quantity_verification", "Quantity Verification"],
  ["reconciliation_exception", "Reconciliation & Exception Reporting"],
  ["loading_discharge_supervision", "Loading & Discharge Supervision"],
  ["inventory_audit", "Inventory Audit Support"],
  ["loss_discrepancy_investigation", "Loss & Discrepancy Investigation"],
  ["documentation_reporting", "Documentation & Reporting"],
  ["stock_control_advisory", "Stock Control Advisory"],
].map(([key, label]) => ({ key, label }));
t("every name on the public quote form maps to the right service", () => {
  const form = {
    "Stock Monitoring": "stock_monitoring",
    "Collateral Verification": "collateral_verification",
    "Tank & Depot Inspections": "tank_depot_inspection",
    "Quantity Verification": "quantity_verification",
    "Reconciliation & Exception Reporting": "reconciliation_exception",
    "Loading & Discharge Supervision": "loading_discharge_supervision",
    "Inventory Audit Support": "inventory_audit",
    "Loss & Discrepancy Investigation": "loss_discrepancy_investigation",
    "Documentation & Reporting": "documentation_reporting",
    "Stock Control Advisory": "stock_control_advisory",
  };
  for (const [text, key] of Object.entries(form)) assert.equal(matchServiceKey(text, OPTIONS), key, text);
});
t("older singular and key forms also match", () => {
  assert.equal(matchServiceKey("Tank and Depot Inspection", OPTIONS), "tank_depot_inspection");
  assert.equal(matchServiceKey("stock_monitoring", OPTIONS), "stock_monitoring");
  assert.equal(matchServiceKey("  STOCK   monitoring services ", OPTIONS), "stock_monitoring");
});
t("unclear names never guess", () => {
  assert.equal(matchServiceKey("Not sure yet", OPTIONS), null);
  assert.equal(matchServiceKey("TEST — Paystack Flow Verification", OPTIONS), null);
  assert.equal(matchServiceKey("", OPTIONS), null);
  assert.equal(matchServiceKey(null, OPTIONS), null);
});
t("a name that fits two services is treated as ambiguous", () => {
  const dup = [{ key: "a", label: "Inspection Services" }, { key: "b", label: "Inspection" }];
  assert.equal(matchServiceKey("Inspection", dup), null);
});


// ---- the Automations page: descriptions, health and wording
const NOW = new Date("2026-09-22T12:00:00Z").getTime();
const runAt = (hoursAgo, ok = true) => ({ task: "x", ok, startedAt: new Date(NOW - hoursAgo * 3600 * 1000), source: "daily", summary: {}, error: null });
t("automations catalogue: every scheduled one can be tracked, and ids are unique", () => {
  const ids = catalog.AUTOMATIONS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of catalog.AUTOMATIONS) {
    if (a.kind === "scheduled") { assert.ok(a.task, a.id + " needs a task"); assert.ok(a.cadence, a.id + " needs a cadence"); }
    assert.ok(a.does.length > 0 && a.never && a.summary && a.when, a.id + " is missing wording");
  }
});
t("automations catalogue: written for the client's team, with no technical wording", () => {
  const banned = /\b(cron|sql|database|migration|api|webhook|supabase|drizzle|endpoint|github|vercel|env|json|http|token|server|deploy|schema)\b/i;
  for (const a of catalog.AUTOMATIONS) {
    const text = [a.name, a.summary, a.when, a.never, ...a.does].join(" | ");
    assert.equal(banned.test(text), false, a.id + ": " + (text.match(banned) || [])[0]);
    assert.equal(text.includes("\u2014"), false, a.id + " has an em dash");
  }
  for (const label of Object.values(catalog.EVENT_LABELS)) assert.equal(banned.test(label), false, label);
});
t("automations health: healthy, late, failed and never-run are told apart", () => {
  assert.equal(catalog.assessHealth("daily", runAt(5), false, NOW), "healthy");
  assert.equal(catalog.assessHealth("daily", runAt(30), false, NOW), "late");
  assert.equal(catalog.assessHealth("daily", runAt(1, false), false, NOW), "failed");
  assert.equal(catalog.assessHealth("daily", undefined, false, NOW), "waiting");
});
t("automations health: hourly ones are judged hourly only once the hourly schedule is in use", () => {
  assert.equal(catalog.assessHealth("hourly-or-daily", runAt(5), true, NOW), "late");    // hourly schedule seen, 5h is too long
  assert.equal(catalog.assessHealth("hourly-or-daily", runAt(5), false, NOW), "healthy"); // daily only: 5h is fine
  assert.equal(catalog.assessHealth("hourly-or-daily", runAt(1), true, NOW), "healthy");
  assert.equal(catalog.assessHealth("npa", runAt(20), false, NOW), "healthy");
});
t("automations wording: run results read as plain sentences", () => {
  assert.equal(catalog.describeRun("invoice-reminders", { dueSoon: 2, overdue7: 1, overdue14: 0, overdueFlagged: 1 }), "Sent 4 reminders.");
  assert.equal(catalog.describeRun("invoice-reminders", { dueSoon: 0, overdue7: 0, overdue14: 0, overdueFlagged: 0 }), "No reminders were due.");
  assert.equal(catalog.describeRun("auto-close", { closed: 1 }), "Closed 1 job.");
  assert.equal(catalog.describeRun("auto-assign", { enabled: false }), "Switched off, so nothing to do.");
  assert.equal(catalog.describeRun("auto-assign", { enabled: true, assigned: 1, reassigned: 0, unmatched: 2 }), "Assigned 1, moved on 0, 2 still need a person.");
  assert.equal(catalog.describeRun("auto-approve", { mode: "shadow" }), "Not in Automatic mode, so nothing to do.");
  assert.equal(catalog.describeRun("ops-digest", { itemsListed: 3 }), "Listed 3 items for your team.");
  assert.equal(catalog.describeRun("something-new", null), "Completed.");
});
t("automations wording: relative times", () => {
  const ago = (min) => new Date(NOW - min * 60000);
  assert.equal(catalog.agoText(ago(0), NOW), "just now");
  assert.equal(catalog.agoText(ago(1), NOW), "1 minute ago");
  assert.equal(catalog.agoText(ago(45), NOW), "45 minutes ago");
  assert.equal(catalog.agoText(ago(180), NOW), "3 hours ago");
  assert.equal(catalog.agoText(ago(24 * 60), NOW), "yesterday");
  assert.equal(catalog.agoText(ago(5 * 24 * 60), NOW), "5 days ago");
});

console.log(`\n${n} tests passed`);
