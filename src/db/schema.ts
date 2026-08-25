import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const submissions = pgTable(
  "submissions",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    name: text("name").notNull(),
    company: text("company"),
    phone: text("phone"),
    email: text("email"),
    service: text("service"),
    message: text("message"),
    convertedJobId: integer("converted_job_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("submissions_type_idx").on(table.type),
    index("submissions_created_at_idx").on(table.createdAt),
  ],
);

export const clients = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("clients_email_idx").on(table.email)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    ref: text("ref").notNull().unique(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    location: text("location"),
    cargoType: text("cargo_type"),
    notes: text("notes"),
    status: text("status").notNull().default("submitted"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("jobs_client_idx").on(table.clientId),
    index("jobs_status_idx").on(table.status),
  ],
);

export const jobUpdates = pgTable(
  "job_updates",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("job_updates_job_idx").on(table.jobId)],
);

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("report"), // report | coq | other
    title: text("title").notNull(),
    url: text("url"),
    fileData: text("file_data"), // base64 data URL for small uploads
    mimeType: text("mime_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("documents_job_idx").on(table.jobId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    number: text("number").notNull().unique(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("GHS"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: text("status").notNull().default("sent"), // draft | sent | paid
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (table) => [
    index("invoices_job_idx").on(table.jobId),
    index("invoices_status_idx").on(table.status),
  ],
);

export const emailLog = pgTable(
  "email_log",
  {
    id: serial("id").primaryKey(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    provider: text("provider").notNull(), // smtp | resend | skipped
    status: text("status").notNull(), // sent | failed | skipped
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("email_log_created_idx").on(table.createdAt)],
);

/* ---------------- Analytics product ---------------- */

export const analyticsUsers = pgTable(
  "analytics_users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    company: text("company"),
    phone: text("phone"),
    passwordHash: text("password_hash"), // null until first-login setup
    setupToken: text("setup_token").unique(),
    setupTokenExpires: timestamp("setup_token_expires", { withTimezone: true }),
    status: text("status").notNull().default("invited"), // invited | active | disabled
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("analytics_users_email_idx").on(table.email),
    index("analytics_users_status_idx").on(table.status),
  ],
);

export const analyticsChats = pgTable(
  "analytics_chats",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => analyticsUsers.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("analytics_chats_user_idx").on(table.userId)],
);

export const analyticsMessages = pgTable(
  "analytics_messages",
  {
    id: serial("id").primaryKey(),
    chatId: integer("chat_id")
      .notNull()
      .references(() => analyticsChats.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    content: text("content").notNull(),
    sources: jsonb("sources"), // future: [{docId, title, quote}] citations
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("analytics_messages_chat_idx").on(table.chatId)],
);

/**
 * Shared document store for retrieval-augmented answers.
 * scope='global'  -> admin-uploaded reference corpus for every subscriber.
 * scope='client'  -> a client's own files; answers scoped to their documents.
 * Status tracks the future ingestion pipeline (upload -> ready for retrieval).
 */
export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: serial("id").primaryKey(),
    scope: text("scope").notNull().default("global"), // global | client
    clientId: integer("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    url: text("url"),
    fileData: text("file_data"), // base64 data URL, same pattern as documents
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    status: text("status").notNull().default("uploaded"), // uploaded | processing | ready | failed
    error: text("error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("knowledge_docs_scope_idx").on(table.scope),
    index("knowledge_docs_client_idx").on(table.clientId),
  ],
);

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobUpdate = typeof jobUpdates.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type EmailLog = typeof emailLog.$inferSelect;
export type AnalyticsUser = typeof analyticsUsers.$inferSelect;
export type AnalyticsChat = typeof analyticsChats.$inferSelect;
export type AnalyticsMessage = typeof analyticsMessages.$inferSelect;
export type KnowledgeDocument = typeof knowledgeDocuments.$inferSelect;
