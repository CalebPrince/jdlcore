import postgres from "postgres";
import "dotenv/config";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL not set");
const sql = postgres(url, { ssl: "require" });

try {
  await sql.begin(async (tx) => {
    await tx`
      CREATE TABLE IF NOT EXISTS ai_reviews (
        id SERIAL PRIMARY KEY,
        job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL,
        target_id INTEGER,
        severity TEXT NOT NULL,
        summary TEXT NOT NULL,
        provider TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
    await tx`CREATE INDEX IF NOT EXISTS ai_reviews_job_idx ON ai_reviews (job_id)`;
    await tx`CREATE INDEX IF NOT EXISTS ai_reviews_target_idx ON ai_reviews (target_type, target_id)`;
  });
  console.log("ai_reviews table created.");
} finally {
  await sql.end();
}
