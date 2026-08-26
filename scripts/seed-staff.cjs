require("dotenv").config();
const { randomBytes, scryptSync } = require("crypto");
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before seeding staff.");
const sql = postgres(url, { prepare: false });

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

// Usage: node scripts/seed-staff.cjs "Name" "email@jdlcore.com" "password" [role]
const [, , name, email, password, role = "superadmin"] = process.argv;

async function run() {
  if (!name || !email || !password) {
    console.log('Usage: node scripts/seed-staff.cjs "Name" "email@jdlcore.com" "password" [superadmin|administrator|operations]');
    await sql.end();
    process.exit(1);
  }
  const [row] = await sql`
    insert into staff (name, email, role, password_hash, status)
    values (${name}, ${email.toLowerCase()}, ${role}, ${hashPassword(password)}, 'active')
    on conflict (email) do update set
      role = excluded.role,
      password_hash = excluded.password_hash,
      status = 'active'
    returning id, name, email, role
  `;
  console.log("Staff account ready:", row);
  await sql.end();
}

run().catch(async (error) => {
  console.error(error);
  await sql.end();
  process.exit(1);
});
