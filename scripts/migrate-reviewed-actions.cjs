require("dotenv").config();
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the Reviewed actions migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      create table if not exists proposed_actions (
        id serial primary key,
        action_type text not null,
        target_type text not null,
        target_id integer not null,
        summary text not null,
        payload jsonb not null,
        proposed_state jsonb not null,
        status text not null default 'pending',
        agent_run_id integer references agent_runs(id) on delete set null,
        proposed_by_staff_id integer references staff(id) on delete set null,
        reviewed_by_staff_id integer references staff(id) on delete set null,
        reviewed_at timestamptz,
        review_note text,
        approved_state jsonb,
        execution_result jsonb,
        executed_at timestamptz,
        created_at timestamptz not null default now()
      );
      create index if not exists proposed_actions_status_idx on proposed_actions(status);
      create index if not exists proposed_actions_target_idx on proposed_actions(target_type, target_id);
    `);
  });
  console.log("Reviewed actions migration complete: proposed_actions table is ready.");
  await sql.end();
}

run().catch(async (error) => {
  console.error("Reviewed actions migration failed:", error.message || error);
  await sql.end();
  process.exit(1);
});
