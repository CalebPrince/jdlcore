require("dotenv").config();
const postgres = require("postgres");
const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the Analytics billing migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.unsafe(`
    alter table analytics_users add column if not exists plan text;
    alter table analytics_users add column if not exists subscription_status text not null default 'none';
    alter table analytics_users add column if not exists paystack_customer_code text;
    alter table analytics_users add column if not exists paystack_subscription_code text;
    alter table analytics_users add column if not exists paystack_plan_code text;
    alter table analytics_users add column if not exists current_period_start timestamptz;
    alter table analytics_users add column if not exists current_period_end timestamptz;
    alter table analytics_users add column if not exists monthly_question_limit integer;
    alter table analytics_users add column if not exists seat_limit integer;
    create index if not exists analytics_users_customer_code_idx on analytics_users(paystack_customer_code);
    create unique index if not exists analytics_users_subscription_code_idx on analytics_users(paystack_subscription_code);
  `);
  console.log("Analytics billing migration complete: subscribers now track plan, Paystack subscription, and quota fields.");
  await sql.end();
}
run().catch(async (error) => { console.error("Analytics billing migration failed:", error.message || error); await sql.end(); process.exit(1); });
