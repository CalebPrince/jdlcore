require("dotenv").config();
const { randomBytes, scryptSync } = require("crypto");
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before seeding an inspector.");
const sql = postgres(url, { prepare: false });

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Usage: node scripts/seed-inspector.cjs "Name" "email@jdlcore.com" "password" ["phone"]
const [, , name, email, password, phone] = process.argv;

async function run() {
  if (!name || !email || !password) {
    console.log('Usage: node scripts/seed-inspector.cjs "Name" "email@jdlcore.com" "password" ["phone"]');
    await sql.end();
    process.exit(1);
  }
  const [row] = await sql`
    insert into inspectors (name, email, phone, password_hash, status, active)
    values (${name}, ${email.toLowerCase()}, ${phone || null}, ${hashPassword(password)}, 'active', true)
    on conflict (email) do update set
      password_hash = excluded.password_hash,
      status = 'active',
      active = true
    returning id, name, email
  `;
  console.log("Inspector account ready:", row);
  await sql.end();
}

run().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
