const postgres = require("postgres");
const sql = postgres(process.env.DATABASE_URL, { prepare: false });

(async () => {
  await sql`CREATE TABLE IF NOT EXISTS analytics_users (
    id serial PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL UNIQUE,
    company text,
    phone text,
    password_hash text,
    setup_token text UNIQUE,
    setup_token_expires timestamptz,
    status text NOT NULL DEFAULT 'invited',
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS analytics_users_email_idx ON analytics_users (email)`;
  await sql`CREATE INDEX IF NOT EXISTS analytics_users_status_idx ON analytics_users (status)`;

  await sql`CREATE TABLE IF NOT EXISTS analytics_chats (
    id serial PRIMARY KEY,
    user_id integer NOT NULL REFERENCES analytics_users(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'New chat',
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS analytics_chats_user_idx ON analytics_chats (user_id)`;

  await sql`CREATE TABLE IF NOT EXISTS analytics_messages (
    id serial PRIMARY KEY,
    chat_id integer NOT NULL REFERENCES analytics_chats(id) ON DELETE CASCADE,
    role text NOT NULL,
    content text NOT NULL,
    sources jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS analytics_messages_chat_idx ON analytics_messages (chat_id)`;

  await sql`CREATE TABLE IF NOT EXISTS knowledge_documents (
    id serial PRIMARY KEY,
    scope text NOT NULL DEFAULT 'global',
    client_id integer REFERENCES clients(id) ON DELETE CASCADE,
    title text NOT NULL,
    url text,
    file_data text,
    mime_type text,
    size_bytes integer,
    status text NOT NULL DEFAULT 'uploaded',
    error text,
    processed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS knowledge_docs_scope_idx ON knowledge_documents (scope)`;
  await sql`CREATE INDEX IF NOT EXISTS knowledge_docs_client_idx ON knowledge_documents (client_id)`;

  console.log("analytics tables ready");
  await sql.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
