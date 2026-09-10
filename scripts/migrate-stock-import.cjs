require("dotenv").config();
const postgres = require("postgres");
const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the stock-import migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.unsafe(`
    create table if not exists stock_imports (
      id serial primary key,
      job_id integer not null references jobs(id) on delete cascade,
      actor_type text not null,
      actor_id integer,
      actor_name text not null,
      file_name text not null,
      mime_type text,
      size_bytes integer,
      provider text,
      row_count integer not null default 0,
      file_data text,
      created_at timestamptz not null default now()
    );
    create index if not exists stock_imports_job_idx on stock_imports(job_id);

    alter table stock_readings add column if not exists source text not null default 'manual';
    alter table stock_readings add column if not exists import_id integer references stock_imports(id) on delete set null;
  `);
  console.log("Stock-import migration complete: stock_imports table + stock_readings.source/import_id are ready.");
  await sql.end();
}
run().catch(async (error) => { console.error("Stock-import migration failed:", error.message || error); await sql.end(); process.exit(1); });
