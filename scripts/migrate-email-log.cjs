const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

(async () => {
  await sql`CREATE TABLE IF NOT EXISTS email_log (
    id serial PRIMARY KEY,
    to_email text NOT NULL,
    subject text NOT NULL,
    provider text NOT NULL,
    status text NOT NULL,
    error text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS email_log_created_idx ON email_log (created_at)`;
  console.log("email_log ready");
  await sql.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
