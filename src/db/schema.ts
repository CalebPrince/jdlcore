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
  numeric,
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

/**
 * Internal staff accounts for /admin (superadmin | administrator | operations).
 * Invite/setup-token pattern, mirrors analyticsUsers: passwordHash is null until
 * the invited person completes setup via their emailed link.
 */
export const staff = pgTable(
  "staff",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    role: text("role").notNull().default("operations"), // superadmin | administrator | operations
    passwordHash: text("password_hash"),
    setupToken: text("setup_token").unique(),
    setupTokenExpires: timestamp("setup_token_expires", { withTimezone: true }),
    status: text("status").notNull().default("invited"), // invited | active | disabled
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("staff_email_idx").on(table.email),
    index("staff_status_idx").on(table.status),
    index("staff_role_idx").on(table.role),
  ],
);

/**
 * Field inspectors — their own portal, own login, distinct from admin staff.
 */
export const inspectors = pgTable(
  "inspectors",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    setupToken: text("setup_token").unique(),
    setupTokenExpires: timestamp("setup_token_expires", { withTimezone: true }),
    status: text("status").notNull().default("invited"), // invited | active | disabled
    active: boolean("active").notNull().default(true), // operational on/off, independent of invite status
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inspectors_email_idx").on(table.email),
    index("inspectors_status_idx").on(table.status),
    index("inspectors_active_idx").on(table.active),
  ],
);

/**
 * Administrator-managed service catalogue (section 2.2 / 16 of the client's
 * requirements doc): pricing shown to clients, keyed by jobs.serviceType.
 */
export const services = pgTable(
  "services",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull().unique(),
    label: text("label").notNull(),
    description: text("description"),
    pricingLabel: text("pricing_label"), // free text, e.g. "From GHS 1,200 per inspection"
    defaultPriceCents: integer("default_price_cents"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
  },
  (table) => [index("services_active_idx").on(table.active)],
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
    serviceType: text("service_type"), // key into `services`, e.g. "stock_monitoring"
    location: text("location"),
    cargoType: text("cargo_type"),
    product: text("product"),
    tankOrDepot: text("tank_or_depot"),
    requestedDate: timestamp("requested_date", { withTimezone: true }),
    clientRef: text("client_ref"),
    notes: text("notes"),
    status: text("status").notNull().default("awaiting_assignment"),
    assignedInspectorId: integer("assigned_inspector_id").references(() => inspectors.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    approvedByStaffId: integer("approved_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    closedByStaffId: integer("closed_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
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
    index("jobs_inspector_idx").on(table.assignedInspectorId),
    index("jobs_service_type_idx").on(table.serviceType),
  ],
);

/**
 * Append-only status/audit timeline. actorType/actorId/actorName record WHO made
 * each change (added for the multi-role workflow — previously only admin could
 * change status via one shared login, so there was no "who" to record).
 */
export const jobUpdates = pgTable(
  "job_updates",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    status: text("status").notNull(),
    note: text("note"),
    actorType: text("actor_type").notNull().default("system"), // client | inspector | staff | system
    actorId: integer("actor_id"),
    actorName: text("actor_name").notNull().default("JDL Core"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("job_updates_job_idx").on(table.jobId)],
);

/** One row per job — section 7's completion data entry. */
export const jobCompletionData = pgTable(
  "job_completion_data",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id, { onDelete: "cascade" }),
    dateTimeStarted: timestamp("date_time_started", { withTimezone: true }),
    dateTimeCompleted: timestamp("date_time_completed", { withTimezone: true }),
    service: text("service"),
    gov: numeric("gov", { precision: 14, scale: 3 }),
    gsv: numeric("gsv", { precision: 14, scale: 3 }),
    metricTonnesAir: numeric("metric_tonnes_air", { precision: 14, scale: 3 }),
    metricTonnesVacuum: numeric("metric_tonnes_vacuum", { precision: 14, scale: 3 }),
    inspectorComments: text("inspector_comments"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("job_completion_job_idx").on(table.jobId)],
);

/** Static tank reference data for a client's site/depot (section 14). */
export const tanks = pgTable(
  "tanks",
  {
    id: serial("id").primaryKey(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    product: text("product"),
    depot: text("depot"),
    capacity: numeric("capacity", { precision: 14, scale: 3 }),
    capacityUnit: text("capacity_unit").notNull().default("MT"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("tanks_client_idx").on(table.clientId)],
);

/** Recurring per-tank readings an inspector logs through a Stock Monitoring job. */
export const stockReadings = pgTable(
  "stock_readings",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    tankId: integer("tank_id")
      .notNull()
      .references(() => tanks.id, { onDelete: "cascade" }),
    readingDate: timestamp("reading_date", { withTimezone: true }).notNull(),
    openingStock: numeric("opening_stock", { precision: 14, scale: 3 }),
    receipts: numeric("receipts", { precision: 14, scale: 3 }),
    transfers: numeric("transfers", { precision: 14, scale: 3 }),
    dischargesLoads: numeric("discharges_loads", { precision: 14, scale: 3 }),
    closingStock: numeric("closing_stock", { precision: 14, scale: 3 }),
    gsv: numeric("gsv", { precision: 14, scale: 3 }),
    notes: text("notes"),
    recordedByInspectorId: integer("recorded_by_inspector_id").references(() => inspectors.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_readings_job_idx").on(table.jobId),
    index("stock_readings_tank_idx").on(table.tankId),
    index("stock_readings_date_idx").on(table.readingDate),
  ],
);

/** Client-visible comment thread on a job (section 3) — distinct from the system jobUpdates timeline. */
export const jobComments = pgTable(
  "job_comments",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    authorType: text("author_type").notNull(), // client | inspector | staff
    authorId: integer("author_id"),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("job_comments_job_idx").on(table.jobId)],
);

/**
 * AI second-opinion checks run against submitted completion data, uploaded
 * documents, and payment receipts — surfaced to Operations alongside (never
 * instead of) their own manual approval/verification decision.
 */
export const aiReviews = pgTable(
  "ai_reviews",
  {
    id: serial("id").primaryKey(),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(), // completion_data | document | receipt
    targetId: integer("target_id"), // documents.id or invoices.id; null for completion_data
    severity: text("severity").notNull(), // none | low | medium | high
    summary: text("summary").notNull(),
    provider: text("provider"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("ai_reviews_job_idx").on(table.jobId),
    index("ai_reviews_target_idx").on(table.targetType, table.targetId),
  ],
);

/** Certificate of Quantity — one per approved job (section 12). */
export const certificates = pgTable(
  "certificates",
  {
    id: serial("id").primaryKey(),
    coqNumber: text("coq_number").notNull().unique(),
    jobId: integer("job_id")
      .notNull()
      .unique()
      .references(() => jobs.id, { onDelete: "cascade" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedByStaffId: integer("issued_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    remarks: text("remarks"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("certificates_job_idx").on(table.jobId)],
);

/** In-app notifications (section 15) — email leg still goes through sendNotification separately. */
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    recipientType: text("recipient_type").notNull(), // client | inspector | staff
    recipientId: integer("recipient_id").notNull(),
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_recipient_idx").on(table.recipientType, table.recipientId, table.read),
    index("notifications_created_idx").on(table.createdAt),
  ],
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
    // pending | payment_submitted | payment_verified | paid | payment_rejected
    status: text("status").notNull().default("pending"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    receiptFileData: text("receipt_file_data"), // base64 data URL, same pattern as documents.fileData
    receiptMimeType: text("receipt_mime_type"),
    paymentReference: text("payment_reference"),
    clientComment: text("client_comment"),
    paymentSubmittedAt: timestamp("payment_submitted_at", { withTimezone: true }),
    paymentVerifiedAt: timestamp("payment_verified_at", { withTimezone: true }),
    verifiedByStaffId: integer("verified_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    paymentRejectedReason: text("payment_rejected_reason"),
    overdueNotifiedAt: timestamp("overdue_notified_at", { withTimezone: true }),
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

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    accountType: text("account_type").notNull(), // academy | analytics | portal
    accountId: integer("account_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("password_reset_account_idx").on(table.accountType, table.accountId),
    index("password_reset_expiry_idx").on(table.expiresAt),
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
export type Staff = typeof staff.$inferSelect;
export type Inspector = typeof inspectors.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type JobUpdate = typeof jobUpdates.$inferSelect;
export type JobCompletionData = typeof jobCompletionData.$inferSelect;
export type Tank = typeof tanks.$inferSelect;
export type StockReading = typeof stockReadings.$inferSelect;
export type JobComment = typeof jobComments.$inferSelect;
export type Certificate = typeof certificates.$inferSelect;
export type AiReview = typeof aiReviews.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
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
