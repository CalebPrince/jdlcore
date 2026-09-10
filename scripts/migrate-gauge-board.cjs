require("dotenv").config();
const postgres = require("postgres");
const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the gauge board migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.unsafe(`
    alter table tanks add column if not exists kind text not null default 'tank';
    alter table tanks add column if not exists max_gauge_height_mm numeric(14,3);
    alter table tanks add column if not exists min_pumpable_stop numeric(14,3);

    alter table stock_readings add column if not exists dip_height_mm numeric(14,3);
    alter table stock_readings add column if not exists temperature_c numeric(6,2);
    alter table stock_readings add column if not exists density_at_20 numeric(8,4);
    alter table stock_readings add column if not exists vcf numeric(8,5);
    alter table stock_readings add column if not exists gov numeric(14,3);
    alter table stock_readings add column if not exists net_weight_air numeric(14,3);
    alter table stock_readings add column if not exists net_weight_vacuum numeric(14,3);
    alter table stock_readings add column if not exists pumpable_stock numeric(14,3);
    alter table stock_readings add column if not exists status_remark text;
  `);
  console.log("Gauge board migration complete: tank geometry + gauging detail columns are ready.");
  await sql.end();
}
run().catch(async (error) => { console.error("Gauge board migration failed:", error.message || error); await sql.end(); process.exit(1); });
