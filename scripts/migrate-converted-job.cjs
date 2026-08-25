const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

(async () => {
  await sql`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS converted_job_id integer REFERENCES jobs(id) ON DELETE SET NULL`;
  console.log("submissions.converted_job_id ready");
  await sql.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
