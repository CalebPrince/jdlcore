const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

(async () => {
  await sql`CREATE TABLE IF NOT EXISTS clients (
    id serial PRIMARY KEY,
    name text NOT NULL,
    company text,
    email text NOT NULL UNIQUE,
    phone text,
    password_hash text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS clients_email_idx ON clients (email)`;

  await sql`CREATE TABLE IF NOT EXISTS jobs (
    id serial PRIMARY KEY,
    ref text NOT NULL UNIQUE,
    client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    service text NOT NULL,
    location text,
    cargo_type text,
    notes text,
    status text NOT NULL DEFAULT 'submitted',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS jobs_client_idx ON jobs (client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs (status)`;

  await sql`CREATE TABLE IF NOT EXISTS job_updates (
    id serial PRIMARY KEY,
    job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status text NOT NULL,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS job_updates_job_idx ON job_updates (job_id)`;

  await sql`CREATE TABLE IF NOT EXISTS documents (
    id serial PRIMARY KEY,
    job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    kind text NOT NULL DEFAULT 'report',
    title text NOT NULL,
    url text,
    file_data text,
    mime_type text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS documents_job_idx ON documents (job_id)`;

  await sql`CREATE TABLE IF NOT EXISTS invoices (
    id serial PRIMARY KEY,
    number text NOT NULL UNIQUE,
    job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    amount_cents integer NOT NULL,
    currency text NOT NULL DEFAULT 'GHS',
    due_date timestamptz,
    status text NOT NULL DEFAULT 'sent',
    issued_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz
  )`;
  await sql`CREATE INDEX IF NOT EXISTS invoices_job_idx ON invoices (job_id)`;
  await sql`CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status)`;

  const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  console.log("tables:", tables.map((t) => t.tablename).join(", "));
  await sql.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
