const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

(async () => {
  await sql`INSERT INTO submissions (type, name, company, phone, email, service, message)
    VALUES ('quote', 'Ama Mensah', 'Tema Oil Traders', '+233 24 555 1234', 'ama@temaoil.com',
    'Stock Monitoring', 'Weekly stock monitoring at Tema Harbour depot, 3 tanks.')`;
  const rows = await sql`SELECT id FROM submissions WHERE email = 'ama@temaoil.com' LIMIT 1`;
  console.log("seeded submission id", rows[0].id);
  await sql.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
