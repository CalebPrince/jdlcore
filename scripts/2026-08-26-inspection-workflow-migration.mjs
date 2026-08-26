import "dotenv/config";
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const statements = [
  `CREATE TABLE IF NOT EXISTS staff (
    id serial PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    role text NOT NULL DEFAULT 'operations',
    password_hash text,
    setup_token text UNIQUE,
    setup_token_expires timestamptz,
    status text NOT NULL DEFAULT 'invited',
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS staff_email_idx ON staff (email)`,
  `CREATE INDEX IF NOT EXISTS staff_status_idx ON staff (status)`,
  `CREATE INDEX IF NOT EXISTS staff_role_idx ON staff (role)`,

  `CREATE TABLE IF NOT EXISTS inspectors (
    id serial PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    phone text,
    password_hash text,
    setup_token text UNIQUE,
    setup_token_expires timestamptz,
    status text NOT NULL DEFAULT 'invited',
    active boolean NOT NULL DEFAULT true,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS inspectors_email_idx ON inspectors (email)`,
  `CREATE INDEX IF NOT EXISTS inspectors_status_idx ON inspectors (status)`,
  `CREATE INDEX IF NOT EXISTS inspectors_active_idx ON inspectors (active)`,

  `CREATE TABLE IF NOT EXISTS services (
    id serial PRIMARY KEY,
    key text NOT NULL UNIQUE,
    label text NOT NULL,
    description text,
    pricing_label text,
    default_price_cents integer,
    active boolean NOT NULL DEFAULT true,
    position integer NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS services_active_idx ON services (active)`,

  `ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS service_type text,
    ADD COLUMN IF NOT EXISTS product text,
    ADD COLUMN IF NOT EXISTS tank_or_depot text,
    ADD COLUMN IF NOT EXISTS requested_date timestamptz,
    ADD COLUMN IF NOT EXISTS client_ref text,
    ADD COLUMN IF NOT EXISTS assigned_inspector_id integer REFERENCES inspectors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
    ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
    ADD COLUMN IF NOT EXISTS approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS closed_at timestamptz,
    ADD COLUMN IF NOT EXISTS approved_by_staff_id integer REFERENCES staff(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS closed_by_staff_id integer REFERENCES staff(id) ON DELETE SET NULL`,
  `ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'awaiting_assignment'`,
  `CREATE INDEX IF NOT EXISTS jobs_inspector_idx ON jobs (assigned_inspector_id)`,
  `CREATE INDEX IF NOT EXISTS jobs_service_type_idx ON jobs (service_type)`,

  `ALTER TABLE job_updates
    ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS actor_id integer,
    ADD COLUMN IF NOT EXISTS actor_name text NOT NULL DEFAULT 'JDL Core'`,

  `CREATE TABLE IF NOT EXISTS job_completion_data (
    id serial PRIMARY KEY,
    job_id integer NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    date_time_started timestamptz,
    date_time_completed timestamptz,
    service text,
    gov numeric(14,3),
    gsv numeric(14,3),
    metric_tonnes_air numeric(14,3),
    metric_tonnes_vacuum numeric(14,3),
    inspector_comments text,
    submitted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS job_completion_job_idx ON job_completion_data (job_id)`,

  `CREATE TABLE IF NOT EXISTS tanks (
    id serial PRIMARY KEY,
    client_id integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name text NOT NULL,
    product text,
    depot text,
    capacity numeric(14,3),
    capacity_unit text NOT NULL DEFAULT 'MT',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS tanks_client_idx ON tanks (client_id)`,

  `CREATE TABLE IF NOT EXISTS stock_readings (
    id serial PRIMARY KEY,
    job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    tank_id integer NOT NULL REFERENCES tanks(id) ON DELETE CASCADE,
    reading_date timestamptz NOT NULL,
    opening_stock numeric(14,3),
    receipts numeric(14,3),
    transfers numeric(14,3),
    discharges_loads numeric(14,3),
    closing_stock numeric(14,3),
    gsv numeric(14,3),
    notes text,
    recorded_by_inspector_id integer REFERENCES inspectors(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS stock_readings_job_idx ON stock_readings (job_id)`,
  `CREATE INDEX IF NOT EXISTS stock_readings_tank_idx ON stock_readings (tank_id)`,
  `CREATE INDEX IF NOT EXISTS stock_readings_date_idx ON stock_readings (reading_date)`,

  `CREATE TABLE IF NOT EXISTS job_comments (
    id serial PRIMARY KEY,
    job_id integer NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    author_type text NOT NULL,
    author_id integer,
    author_name text NOT NULL,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS job_comments_job_idx ON job_comments (job_id)`,

  `CREATE TABLE IF NOT EXISTS certificates (
    id serial PRIMARY KEY,
    coq_number text NOT NULL UNIQUE,
    job_id integer NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
    issued_at timestamptz NOT NULL DEFAULT now(),
    issued_by_staff_id integer REFERENCES staff(id) ON DELETE SET NULL,
    remarks text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS certificates_job_idx ON certificates (job_id)`,

  `CREATE TABLE IF NOT EXISTS notifications (
    id serial PRIMARY KEY,
    recipient_type text NOT NULL,
    recipient_id integer NOT NULL,
    job_id integer REFERENCES jobs(id) ON DELETE CASCADE,
    type text NOT NULL,
    title text NOT NULL,
    body text,
    link text,
    "read" boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (recipient_type, recipient_id, "read")`,
  `CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications (created_at)`,

  `ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS receipt_file_data text,
    ADD COLUMN IF NOT EXISTS receipt_mime_type text,
    ADD COLUMN IF NOT EXISTS payment_reference text,
    ADD COLUMN IF NOT EXISTS client_comment text,
    ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz,
    ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS verified_by_staff_id integer REFERENCES staff(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_rejected_reason text,
    ADD COLUMN IF NOT EXISTS overdue_notified_at timestamptz`,
  `ALTER TABLE invoices ALTER COLUMN status SET DEFAULT 'pending'`,
  `UPDATE invoices SET status = 'pending' WHERE status IN ('draft', 'sent')`,
];

console.log(`Applying ${statements.length} statements in a transaction...`);

await sql.begin(async (tx) => {
  for (const [i, stmt] of statements.entries()) {
    process.stdout.write(`[${i + 1}/${statements.length}] `);
    await tx.unsafe(stmt);
    console.log("ok");
  }
});

console.log("Migration complete.");
await sql.end();
