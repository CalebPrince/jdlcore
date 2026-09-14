require("dotenv").config();
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
if (!url || url.includes("<")) throw new Error("Set DATABASE_URL before running the Admin assistant migration.");
const sql = postgres(url, { prepare: false, max: 1 });

async function run() {
  await sql.begin(async (tx) => {
    await tx.unsafe(`
      create table if not exists admin_assistant_chats (
        id serial primary key,
        staff_id integer not null references staff(id) on delete cascade,
        title text not null default 'New conversation',
        created_at timestamptz not null default now()
      );
      create index if not exists admin_assistant_chats_staff_idx on admin_assistant_chats(staff_id);
      create table if not exists admin_assistant_messages (
        id serial primary key,
        chat_id integer not null references admin_assistant_chats(id) on delete cascade,
        role text not null,
        content text not null,
        evidence jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists admin_assistant_messages_chat_idx on admin_assistant_messages(chat_id);
    `);
  });
  console.log("Admin assistant migration complete: conversation history tables are ready.");
  await sql.end();
}

run().catch(async (error) => {
  console.error("Admin assistant migration failed:", error.message || error);
  await sql.end();
  process.exit(1);
});
