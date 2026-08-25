const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

(async () => {
  const m = await sql`SELECT role, length(content) AS len FROM analytics_messages ORDER BY id`;
  console.log(JSON.stringify(m));
  const c = await sql`SELECT id, title, user_id FROM analytics_chats ORDER BY id`;
  console.log(JSON.stringify(c));
  await sql.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
