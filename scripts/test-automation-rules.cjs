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
  assert.equal(r.found, true); assert.equal(r.inspectorId, 1); assert.match(r.reason, /covers Tema/);
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
console.log(`\n${n} tests passed`);
