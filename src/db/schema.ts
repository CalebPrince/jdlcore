import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  date,
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
    clientId: integer("client_id").references(() => clients.id, { onDelete: "set null" }),
    passwordHash: text("password_hash"), // null until first-login setup
    setupToken: text("setup_token").unique(),
    setupTokenExpires: timestamp("setup_token_expires", { withTimezone: true }),
    status: text("status").notNull().default("invited"), // invited | active | disabled
    dailyLimit: integer("daily_limit").notNull().default(100),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("analytics_users_email_idx").on(table.email),
    index("analytics_users_status_idx").on(table.status),
    index("analytics_users_client_idx").on(table.clientId),
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

export const analyticsDailyUsage = pgTable(
  "analytics_daily_usage",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => analyticsUsers.id, { onDelete: "cascade" }),
    usageDate: date("usage_date", { mode: "string" }).notNull(),
    messageCount: integer("message_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("analytics_daily_usage_user_date_idx").on(table.userId, table.usageDate),
    index("analytics_daily_usage_date_idx").on(table.usageDate),
  ],
);

export const knowledgeDocumentChunks = pgTable(
  "knowledge_document_chunks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => knowledgeDocuments.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("knowledge_chunks_document_idx").on(table.documentId),
    uniqueIndex("knowledge_chunks_position_idx").on(table.documentId, table.position),
  ],
);

/* ---------------- Academy LMS ---------------- */

export const academyLearners = pgTable(
  "academy_learners",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    company: text("company"),
    role: text("role").notNull().default("Learner"),
    passwordHash: text("password_hash").notNull(),
    status: text("status").notNull().default("active"), // active | disabled
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("academy_learners_email_idx").on(table.email),
    index("academy_learners_status_idx").on(table.status),
  ],
);

export const academyCourses = pgTable(
  "academy_courses",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    code: text("code").notNull().unique(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    level: text("level").notNull().default("Foundation"),
    status: text("status").notNull().default("draft"), // draft | published | archived
    accent: text("accent").notNull().default("#eeb02b"),
    passPercent: integer("pass_percent").notNull().default(80),
    estimatedMinutes: integer("estimated_minutes").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("academy_courses_status_idx").on(table.status)],
);

export const academyModules = pgTable(
  "academy_modules",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull().references(() => academyCourses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    position: integer("position").notNull().default(0),
  },
  (table) => [index("academy_modules_course_idx").on(table.courseId)],
);

export const academyLessons = pgTable(
  "academy_lessons",
  {
    id: serial("id").primaryKey(),
    moduleId: integer("module_id").notNull().references(() => academyModules.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("reading"), // reading | video | quiz | assessment
    content: text("content"),
    videoUrl: text("video_url"),
    resourceUrl: text("resource_url"),
    durationMinutes: integer("duration_minutes").notNull().default(0),
    position: integer("position").notNull().default(0),
    published: boolean("published").notNull().default(false),
  },
  (table) => [index("academy_lessons_module_idx").on(table.moduleId)],
);

export const academyEnrollments = pgTable(
  "academy_enrollments",
  {
    id: serial("id").primaryKey(),
    learnerId: integer("learner_id").notNull().references(() => academyLearners.id, { onDelete: "cascade" }),
    courseId: integer("course_id").notNull().references(() => academyCourses.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("active"), // active | completed | withdrawn
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("academy_enrollments_learner_idx").on(table.learnerId),
    index("academy_enrollments_course_idx").on(table.courseId),
  ],
);

export const academyLessonProgress = pgTable(
  "academy_lesson_progress",
  {
    id: serial("id").primaryKey(),
    learnerId: integer("learner_id").notNull().references(() => academyLearners.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull().references(() => academyLessons.id, { onDelete: "cascade" }),
    completed: boolean("completed").notNull().default(false),
    lastPositionSeconds: integer("last_position_seconds").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("academy_progress_learner_idx").on(table.learnerId),
    index("academy_progress_lesson_idx").on(table.lessonId),
  ],
);

export const academyQuizAttempts = pgTable(
  "academy_quiz_attempts",
  {
    id: serial("id").primaryKey(),
    learnerId: integer("learner_id").notNull().references(() => academyLearners.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").notNull().references(() => academyLessons.id, { onDelete: "cascade" }),
    answers: jsonb("answers"),
    scorePercent: integer("score_percent").notNull(),
    passed: boolean("passed").notNull().default(false),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("academy_attempts_learner_idx").on(table.learnerId)],
);

export const academyQuizQuestions = pgTable(
  "academy_quiz_questions",
  {
    id: serial("id").primaryKey(),
    lessonId: integer("lesson_id").notNull().references(() => academyLessons.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    explanation: text("explanation"),
    position: integer("position").notNull().default(0),
  },
  (table) => [index("academy_questions_lesson_idx").on(table.lessonId)],
);

export const academyQuizOptions = pgTable(
  "academy_quiz_options",
  {
    id: serial("id").primaryKey(),
    questionId: integer("question_id").notNull().references(() => academyQuizQuestions.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    correct: boolean("correct").notNull().default(false),
    position: integer("position").notNull().default(0),
  },
  (table) => [index("academy_options_question_idx").on(table.questionId)],
);

export const academyCertificates = pgTable(
  "academy_certificates",
  {
    id: serial("id").primaryKey(),
    learnerId: integer("learner_id").notNull().references(() => academyLearners.id, { onDelete: "cascade" }),
    courseId: integer("course_id").notNull().references(() => academyCourses.id, { onDelete: "cascade" }),
    certificateNumber: text("certificate_number").notNull().unique(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("academy_certificates_learner_idx").on(table.learnerId)],
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
export type KnowledgeDocumentChunk = typeof knowledgeDocumentChunks.$inferSelect;
export type AcademyLearner = typeof academyLearners.$inferSelect;
export type AcademyCourse = typeof academyCourses.$inferSelect;
export type AcademyModule = typeof academyModules.$inferSelect;
export type AcademyLesson = typeof academyLessons.$inferSelect;
export type AcademyEnrollment = typeof academyEnrollments.$inferSelect;
export type AcademyLessonProgress = typeof academyLessonProgress.$inferSelect;
export type AcademyQuizAttempt = typeof academyQuizAttempts.$inferSelect;
export type AcademyQuizQuestion = typeof academyQuizQuestions.$inferSelect;
export type AcademyQuizOption = typeof academyQuizOptions.$inferSelect;
export type AcademyCertificate = typeof academyCertificates.$inferSelect;
