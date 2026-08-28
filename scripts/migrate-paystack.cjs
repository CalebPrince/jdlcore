require("dotenv").config();
const postgres = require("postgres");
const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the Paystack migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.unsafe(`
    alter table invoices add column if not exists payment_method text;
    alter table invoices add column if not exists paystack_reference text;
    create unique index if not exists invoices_paystack_reference_idx on invoices(paystack_reference);
  `);
  console.log("Paystack migration complete: invoices now track payment_method and paystack_reference.");
  await sql.end();
}
run().catch(async (error) => { console.error("Paystack migration failed:", error.message || error); await sql.end(); process.exit(1); });
