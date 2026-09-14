require("dotenv").config();
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the Agent runner migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      create table if not exists agent_runs (
        id serial primary key,
        staff_id integer not null references staff(id) on delete cascade,
        goal text not null,
        status text not null default 'running',
        stop_reason text,
        total_steps integer not null default 0,
        total_input_tokens integer not null default 0,
        total_output_tokens integer not null default 0,
        started_at timestamptz not null default now(),
        completed_at timestamptz
      );
      create index if not exists agent_runs_staff_idx on agent_runs(staff_id);
      create table if not exists agent_steps (
        id serial primary key,
        run_id integer not null references agent_runs(id) on delete cascade,
        step_number integer not null,
        role text not null,
        content text not null default '',
        tool_calls jsonb,
        tool_name text,
        tool_call_id text,
        provider text,
        input_tokens integer,
        output_tokens integer,
        created_at timestamptz not null default now()
      );
      create index if not exists agent_steps_run_idx on agent_steps(run_id);
    `);
  });
  console.log("Agent runner migration complete: agent_runs and agent_steps tables are ready.");
  await sql.end();
}

run().catch(async (error) => {
  console.error("Agent runner migration failed:", error.message || error);
  await sql.end();
  process.exit(1);
});
