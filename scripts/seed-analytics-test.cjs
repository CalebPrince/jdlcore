const postgres = require("postgres");
const { randomBytes, scryptSync } = require("node:crypto");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

(async () => {
  const hash = hashPassword("betapass123");
  await sql`
    INSERT INTO analytics_users (name, email, company, phone, password_hash, status)
    VALUES ('Kwame Beta', 'beta@temaoil.com', 'Tema Oil Traders', '+233 24 000 9999', ${hash}, 'active')
    ON CONFLICT (email) DO UPDATE SET password_hash = ${hash}, status = 'active'
  `;
  const rows = await sql`SELECT id FROM analytics_users WHERE email = 'beta@temaoil.com' LIMIT 1`;
  console.log(rows[0].id);
  await sql.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
