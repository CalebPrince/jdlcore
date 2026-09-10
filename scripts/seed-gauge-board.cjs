/**
 * Demo data for the Inventory Monitoring gauge board.
 * Creates a depot of tanks + a pipeline for client #1, a stock_monitoring job,
 * and ~30 days of daily readings (with two skipped days and one tank below min-stop).
 *
 *   node scripts/seed-gauge-board.cjs
 */
require("dotenv").config();
const postgres = require("postgres");
const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before seeding the gauge board.");
const sql = postgres(url, { prepare: false, max: 1 });

const DEPOT = "Tema";
const CLIENT_ID = 1;

const TANKS = [
  { name: "TK 51", kind: "tank", product: "AGO", capacity: 46000, maxH: 18000, minStop: 800, fill: 0.9 },
  { name: "TK 52", kind: "tank", product: "AGO", capacity: 46000, maxH: 18000, minStop: 800, fill: 0.24 },
  { name: "TK 54", kind: "tank", product: "PMS", capacity: 20000, maxH: 18000, minStop: 900, fill: 0.02 },
  { name: "TK 56", kind: "tank", product: "PMS", capacity: 46000, maxH: 18000, minStop: 800, fill: 0.62 },
  { name: '36" P/LINE (SPM)', kind: "pipeline", product: "Crude", capacity: 8000, maxH: null, minStop: null, fill: 0.75 },
];

async function run() {
  // Re-runnable: drop any prior seed job (readings cascade).
  await sql`delete from jobs where client_id = ${CLIENT_ID} and ref like 'JDL-SEED-%'`;
  // Retire earlier ad-hoc demo tanks so the board only shows this depot.
  await sql`
    update tanks set active = false
    where client_id = ${CLIENT_ID} and name <> all(${sql.array(TANKS.map((t) => t.name))})`;

  const [job] = await sql`
    insert into jobs (ref, client_id, service, service_type, location, product, tank_or_depot, status)
    values (
      ${"JDL-SEED-" + Date.now().toString().slice(-5)}, ${CLIENT_ID},
      'Stock Monitoring Services', 'stock_monitoring', ${DEPOT}, 'AGO/PMS', ${DEPOT}, 'in_progress'
    )
    returning id`;

  const inspector = (await sql`select id from inspectors order by id limit 1`)[0];

  const tankIds = [];
  for (const t of TANKS) {
    const existing = (
      await sql`select id from tanks where client_id = ${CLIENT_ID} and name = ${t.name} limit 1`
    )[0];
    let id;
    if (existing) {
      id = existing.id;
      await sql`
        update tanks set kind = ${t.kind}, depot = ${DEPOT}, product = ${t.product},
          capacity = ${t.capacity}, capacity_unit = 'MT',
          max_gauge_height_mm = ${t.maxH}, min_pumpable_stop = ${t.minStop}, active = true
        where id = ${id}`;
    } else {
      id = (
        await sql`
          insert into tanks (client_id, name, kind, product, depot, capacity, capacity_unit, max_gauge_height_mm, min_pumpable_stop)
          values (${CLIENT_ID}, ${t.name}, ${t.kind}, ${t.product}, ${DEPOT}, ${t.capacity}, 'MT', ${t.maxH}, ${t.minStop})
          returning id`
      )[0].id;
    }
    tankIds.push(id);
  }

  const today = new Date();
  today.setUTCHours(7, 0, 0, 0);
  let inserted = 0;

  for (let d = 31; d >= 0; d--) {
    if (d === 8 || d === 9) continue; // skipped TDS days
    const date = new Date(today.getTime() - d * 86400000);

    for (let ti = 0; ti < TANKS.length; ti++) {
      const t = TANKS[ti];
      const drift = 1 - d / 40 + (Math.sin(d / 3 + ti) * 0.04);
      const fill = Math.max(0.01, Math.min(0.98, t.fill * drift));
      const gsv = Math.round(t.capacity * fill * 1.18 * 1000) / 1000; // m³
      const density = 0.83 + ti * 0.006;
      const netAir = Math.round(gsv * density * 1000) / 1000;
      const dip = t.maxH ? Math.round(t.maxH * fill * 1000) / 1000 : null;
      const pumpable = t.minStop != null ? Math.max(0, Math.round((netAir - t.minStop) * 1000) / 1000) : netAir;
      const remark =
        t.kind === "pipeline" ? null : ti === 1 ? "FEEDING" : ti === 3 ? "FINAL SHIP" : "GOOD";

      await sql`
        insert into stock_readings (
          job_id, tank_id, reading_date, closing_stock, gsv, dip_height_mm, temperature_c,
          density_at_20, vcf, gov, net_weight_air, net_weight_vacuum, pumpable_stock, status_remark,
          recorded_by_inspector_id
        ) values (
          ${job.id}, ${tankIds[ti]}, ${date.toISOString()}, ${netAir}, ${gsv}, ${dip}, ${(27 + ti).toFixed(2)},
          ${density.toFixed(4)}, ${(0.992 + ti * 0.0002).toFixed(5)}, ${(gsv * 1.005).toFixed(3)},
          ${netAir}, ${(netAir * 1.0011).toFixed(3)}, ${pumpable}, ${remark},
          ${inspector ? inspector.id : null}
        )`;
      inserted++;
    }
  }

  console.log(`Seeded job #${job.id}, ${tankIds.length} tanks at ${DEPOT}, ${inserted} readings.`);
  await sql.end();
}
run().catch(async (e) => {
  console.error("Seed failed:", e.message || e);
  await sql.end();
  process.exit(1);
});
