require("dotenv").config();
const postgres = require("postgres");
const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the payment transactions migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.unsafe(`
    create table if not exists payment_transactions (
      id serial primary key,
      kind text not null,
      status text not null,
      reference text not null,
      amount_cents integer not null,
      currency text not null,
      description text not null,
      payer_email text,
      invoice_id integer references invoices(id) on delete set null,
      analytics_user_id integer references analytics_users(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create index if not exists payment_transactions_created_idx on payment_transactions(created_at);
    create index if not exists payment_transactions_kind_idx on payment_transactions(kind);
  `);
  console.log("Payment transactions migration complete: the Admin > Payments ledger is ready.");
  await sql.end();
}
run().catch(async (error) => { console.error("Payment transactions migration failed:", error.message || error); await sql.end(); process.exit(1); });
