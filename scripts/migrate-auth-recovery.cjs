require("dotenv").config();
const postgres = require("postgres");
const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the recovery migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.unsafe(`
    create table if not exists password_reset_tokens (
      id serial primary key,
      account_type text not null,
      account_id integer not null,
      token_hash text not null unique,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );
    create index if not exists password_reset_account_idx on password_reset_tokens(account_type, account_id);
    create index if not exists password_reset_expiry_idx on password_reset_tokens(expires_at);
  `);
  console.log("Account recovery migration complete: one-time reset tokens are ready.");
  await sql.end();
}
run().catch(async (error) => { console.error("Recovery migration failed:", error.message || error); await sql.end(); process.exit(1); });
