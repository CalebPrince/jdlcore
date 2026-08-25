require("dotenv").config();
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the Analytics migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      create table if not exists analytics_users (
        id serial primary key, name text not null, email text not null unique,
        company text, phone text, password_hash text, setup_token text unique,
        setup_token_expires timestamptz, status text not null default 'invited',
        last_login_at timestamptz, created_at timestamptz not null default now()
      );
      create index if not exists analytics_users_email_idx on analytics_users(email);
      create index if not exists analytics_users_status_idx on analytics_users(status);
      alter table analytics_users add column if not exists daily_limit integer not null default 100;
      alter table analytics_users add column if not exists client_id integer references clients(id) on delete set null;
      create index if not exists analytics_users_client_idx on analytics_users(client_id);
      create table if not exists analytics_chats (
        id serial primary key, user_id integer not null references analytics_users(id) on delete cascade,
        title text not null default 'New chat', created_at timestamptz not null default now()
      );
      create index if not exists analytics_chats_user_idx on analytics_chats(user_id);
      create table if not exists analytics_messages (
        id serial primary key, chat_id integer not null references analytics_chats(id) on delete cascade,
        role text not null, content text not null, sources jsonb, created_at timestamptz not null default now()
      );
      create index if not exists analytics_messages_chat_idx on analytics_messages(chat_id);
      create table if not exists analytics_daily_usage (
        id serial primary key,
        user_id integer not null references analytics_users(id) on delete cascade,
        usage_date date not null,
        message_count integer not null default 0,
        updated_at timestamptz not null default now()
      );
      create unique index if not exists analytics_daily_usage_user_date_idx on analytics_daily_usage(user_id, usage_date);
      create index if not exists analytics_daily_usage_date_idx on analytics_daily_usage(usage_date);
      create table if not exists knowledge_documents (
        id serial primary key, scope text not null default 'global',
        client_id integer references clients(id) on delete cascade,
        title text not null, url text, file_data text, mime_type text, size_bytes integer,
        status text not null default 'uploaded', error text, processed_at timestamptz,
        created_at timestamptz not null default now()
      );
      create index if not exists knowledge_docs_scope_idx on knowledge_documents(scope);
      create index if not exists knowledge_docs_client_idx on knowledge_documents(client_id);
      create table if not exists knowledge_document_chunks (
        id serial primary key,
        document_id integer not null references knowledge_documents(id) on delete cascade,
        position integer not null, content text not null, created_at timestamptz not null default now()
      );
      create index if not exists knowledge_chunks_document_idx on knowledge_document_chunks(document_id);
      create unique index if not exists knowledge_chunks_position_idx on knowledge_document_chunks(document_id, position);
    `);
  });
  console.log("Analytics migration complete: platform, document index, and usage-limit tables are ready.");
  await sql.end();
}

run().catch(async (error) => {
  console.error("Analytics migration failed:", error.message || error);
  await sql.end();
  process.exit(1);
});
