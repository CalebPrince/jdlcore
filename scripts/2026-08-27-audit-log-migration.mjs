import postgres from "postgres";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { ssl: "require" });

try {
  await sql.begin(async (tx) => {
    await tx`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        actor_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
        actor_name TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id INTEGER,
        summary TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await tx`CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at)`;
    await tx`CREATE INDEX IF NOT EXISTS audit_log_target_idx ON audit_log (target_type, target_id)`;
  });
  console.log("audit_log table created.");
} finally {
  await sql.end();
}
