# JDL Core Platform

**Industry: Oil & Gas** — independent inspection, industry analytics, and operations training for the oil & gas sector.

JDL Core is a West African oil & gas group with three divisions: independent inspection services, source-grounded industry analytics, and practical operations training for the sector.

The application combines public marketing sites with secure workspaces for staff, clients, inspectors, analytics subscribers, and academy learners.

## Live sites

- [jdlcore.com](https://jdlcore.com) — group landing page
- [inspect.jdlcore.com](https://inspect.jdlcore.com) — Inspection Services
- [analytics.jdlcore.com](https://analytics.jdlcore.com) — Analytics
- [academy.jdlcore.com](https://academy.jdlcore.com) — Academy

## Stack

- Next.js 15 App Router, React 19, and TypeScript
- Tailwind CSS v4
- shadcn/ui and Radix UI primitives
- Lucide icons, with `react-icons` (Simple Icons) and `@iconify/react` for accurate third-party brand marks (Apple, Google Play)
- Drizzle ORM with Supabase Postgres
- Space Grotesk for display typography and IBM Plex Sans for body text through `next/font`
- Next.js Server Actions for authenticated workflows and forms

## AI functionality

The public and Analytics assistants share versioned company and division knowledge. Superadmins can review the code-based Inspection, Analytics, and Academy baseline, save drafts, publish updates, and add divisions under **Admin > AI Settings > Platform knowledge**. This describes application capabilities; it does not grant access to live records or execute actions. See [Platform knowledge](docs/platform-knowledge.md) for publishing behavior, storage, and validation.

JDL Core runs its own AI features on a shared multi-provider gateway (`src/lib/ai/gateway.ts`) rather than depending on a single vendor. It calls Google Gemini, Anthropic Claude, and Groq in order, automatically failing over to the next provider on error, empty response, or truncation, with per-provider models and enable/disable switches configurable from the Admin Command Center.

- **Public site assistant** — a chat widget on the marketing site answers general questions about JDL Core and its divisions, and redirects quote and inspection requests to the contact form or WhatsApp rather than inventing prices, dates, or availability.
- **Analytics chat workspace** — the subscriber-facing Analytics product is a source-grounded chat assistant that answers from retrieved reference material, cites factual claims with `[Doc n]` markers, keeps conversation history, and supports report exports.
- **AI-assisted quality review** — submitted inspection data, uploaded documents, and payment receipts can be reviewed by AI for inconsistencies such as mismatched numbers or incomplete or altered documents. The review flags a severity level and notifies operations staff; a human always makes the final call.
- **AI stock-sheet import** — uploaded petroleum depot "tanks daily situation" sheets are parsed by AI into structured tank-gauge reading rows (dip height, temperature, density, VCF, GOV/GSV, stock movements) for staff to review before saving.
- **Admin operations assistant** — a staff-only, read-only chat under **Admin > Assistant** that looks up permitted jobs, AI quality-review flags, tank-gauge stock readings, and reference documents, citing every claim with a `[Ref n]` link back to the underlying record. It cannot approve, assign, notify, or otherwise change anything.

### Platform knowledge foundation — implemented

- Shared company overview and structured division records for Inspection Services, Analytics, and Academy, describing purpose, application capabilities, workflows, users, pages, and limitations.
- Superadmin editor in **Admin > AI Settings > Platform knowledge**, including support for additional divisions without changing the central assistant prompt.
- Separate draft and published snapshots, numbered publications, editor attribution, publication dates, and settings audit events. Stale revisions are rejected to prevent concurrent overwrites.
- Published knowledge is loaded into both the public and Analytics assistant prompts on each request. Admin-only business review notes are excluded from model context.
- Validation enforces unique division identifiers, required fields, and size limits. Failed knowledge reads produce an unavailable-context instruction rather than restoring obsolete knowledge.
- Corrected the default persona's property/vehicle inspection description and outdated development-status instructions. Corrected the scripted client-portal response and the Analytics message for searches with no matching excerpts.
- Revision history and rollback: every publish snapshots the version it replaces (capped at 20 entries, oldest first evicted); the editor can roll back to any retained version, including the original code baseline, which republishes that old content as a new version rather than rewriting history.
- Exact-context preview: the editor can render the precise context string the assistants would receive for the draft being edited, computed client-side with no publish required.
- Manual needs-review flag per division (with a short note), surfaced as a badge, for an admin to mark a division stale after touching application code it describes — there is no automatic link between code changes and divisions.
- Token-budgeted retrieval: below a character budget every division is included as before; past it, divisions are ranked by term overlap with the caller's latest message and only the top-ranked ones are included in full, with the rest named (not silently dropped) so the assistant can say their details aren't loaded rather than that they don't exist. The company overview is always included. Both the public and Analytics assistants now pass the caller's latest message through for this ranking.

The registry uses the existing `settings` table under `ai_platform_knowledge_v1`; **no database migration is required**. Before an administrator publishes, version 0 uses the code-based baseline. Business availability, accreditation, pricing, and service commitments still require review. This is shared prompt context, not model training or autonomous access to application data.

Only public product information belongs in the registry. Adding a division does not create its pages or integrations. History is capped, so very old versions eventually age out of rollback. Scripted browser fallback responses do not load custom divisions; dynamic answers require a configured AI provider.

Validation completed for this change: production build, TypeScript checking, targeted ESLint, and `node scripts/test-platform-knowledge.cjs`. Tests cover new divisions, validation, exclusion of review notes, published-only context, malformed storage, database outages, needs-review defaults/round-trip, retrieval ranking and budget trimming, and the admin actions' history accrual, stale-revision rejection, rollback (including to the code baseline), missing-version rollback, and the superadmin-only gate. The production build reports existing unused-variable warnings in unrelated files.

**Live rollout check completed (2026-09-12) on jdlcore.com, signed in as superadmin:** reviewed all three divisions' content and business review notes (accurate, no private data); saved a draft and confirmed the published snapshot and live answers were unaffected; published a temporary fourth test division and confirmed the public chat assistant picked it up on its very next reply; removed it and republished to restore the original three-division registry. The live assistant also correctly refused a request for a named client's stock/payment records, correctly answered a cross-division access question (Academy completion does not grant Analytics access), and correctly said it did not have figures for inspector headcount or turnaround time rather than inventing them. Only Groq is currently enabled in the provider failover chain (Gemini and Anthropic keys are stored but toggled off) — chat works fine on Groq alone, but the vision/document-attachment AI features (quality review, stock-sheet import) need Gemini or Anthropic enabled since Groq is text-only.

### Admin operations assistant — implemented

Roadmap step 3 ("Add authorized read tools"). See [Admin operations assistant](docs/admin-assistant.md) for the tool-routing design, access enforcement, and known caveats. Available under **Admin > Assistant** to any active staff member (superadmin, administrator, or operations) — the same audience that already sees every job, flag, and reading in the admin dashboard today, since there is no client- or role-based partitioning of that data yet.

- No structured tool-calling exists in the provider gateway (that is step 4 below), so this is not an autonomous agent: application code reads the caller's message with keyword routing, runs scoped Drizzle queries for whichever domains it recognises (jobs, AI review flags, stock readings, reference documents), and only then hands the model a fixed evidence block to answer from — the model never decides what to query and cannot execute anything.
- Every read tool (`src/lib/ai/admin-assistant-tools.ts`) independently re-checks that the caller is an active staff member before running its query, rather than relying solely on the page/route check.
- Replies must cite every factual claim with an exact `[Ref n]` marker linking to the underlying record; the evidence a reply was grounded in is persisted alongside it and rendered as clickable links in the UI.
- A review-flag search only ever returns severities above `none` — a `none` row can mean either "nothing to flag" or a failed parse of the model's own review response (see `src/lib/ai/document-review.ts`), so the assistant is instructed never to say a job "passed review" from an absence of flags.
- Reference-document search does not reuse `retrieveKnowledge()` from `src/lib/analytics-knowledge.ts` as-is: that function scopes an Analytics subscriber to "global" plus their own client's documents, whereas an admin is not a subscriber of any one client and should see every ready document, so a sibling admin-scoped search was written instead.
- Conversation history persists per staff member (`admin_assistant_chats` / `admin_assistant_messages`; run `npm run db:migrate:admin-assistant`), mirroring the existing Analytics chat schema.
- This is a read-only lookup tool with no write access to any table. It cannot approve, assign, notify, or message anyone — the roadmap's step 5 ("reviewed actions") is what would eventually let a proposed action be prepared for a human to approve.

Validation completed for this change: production build, TypeScript checking, targeted ESLint, and `node scripts/test-admin-assistant.cjs`. Tests cover job-reference/severity extraction and day-arithmetic helpers; independent access enforcement on all four read tools; each tool's evidence formatting (including that stock-reading figures are rendered verbatim from storage, never recomputed by the model); the prompt builder's citation and empty-evidence framing; and keyword-domain routing, including the job-reference/severity extraction threaded through to the tools, the fallback to a jobs lookup when no domain keyword is recognised, and honest reporting of domains that were searched but came back empty. Not yet live-verified in the running application the way the Platform knowledge rollout was in step 1 — do that before relying on it operationally, including confirming Gemini or Anthropic is enabled (Groq alone is fine here, since this feature is text-only, unlike the vision-dependent quality-review and stock-import features).

### What to implement next

These are planned steps, not currently available agent features:

1. ~~**Validate the knowledge in the running application.**~~ Done — see the live rollout check above.
2. ~~**Improve knowledge lifecycle and retrieval.**~~ Done — revision history and rollback, exact-context preview, a manual needs-review flag, and token-budgeted retrieval are implemented and tested; see the Platform knowledge foundation section above and [docs/platform-knowledge.md](docs/platform-knowledge.md). Not yet live-verified in the running application the way step 1 was — the catalogue is still below the retrieval budget, so ranking/trimming hasn't been exercised against real traffic.
3. ~~**Add authorized read tools.**~~ Done — an Admin operations assistant with independently access-checked read tools for jobs, AI review flags, stock readings, and reference documents, evidence-linked citations, and per-staff conversation history; see the Admin operations assistant section above. Not yet live-verified in the running application the way step 1 was.
4. **Build a bounded agent runner.** Extend the provider gateway with structured tool calls and results, persist runs and steps, and enforce time, step, and spending limits. Validate provider tool support before enabling failover for agent runs.
5. **Introduce reviewed actions.** Reuse business services and job transition rules to prepare exact proposed changes. Recheck permissions and record state at approval time, prevent duplicate execution on retries, and retain durable action records. Keep inspection approval, payment verification, report issuance, and external messages under explicit staff control initially.
6. **Add reliable background monitoring.** Partly delivered: a daily scheduled job now covers job follow-ups, stock-reading gaps, invoice reminders, email retries, and deduplicated staff and client notifications; see [Scheduled automations](#scheduled-automations). Still open: a durable worker for sub-daily monitoring and event-driven retries, and expanding to client and learner assistance after access controls and accuracy are verified.

Before relying on automated inspection review, distinguish invalid or failed AI reviews from a successful review with severity `none`. Improve document retrieval beyond the current keyword-ranked chunk sample before using it for broad investigations.

## Scheduled automations

Two Vercel crons (see `vercel.json`, times are UTC, which is also Ghana local time) call routes protected by `CRON_SECRET`; Vercel sends it as `Authorization: Bearer <value>`, and the routes return 500 if it is not configured. Crons are Vercel-only, so a Netlify deployment would not run them.

Idempotency lives in the `automation_events` table (migration `0004`): a run "claims" a `(kind, ref)` pair before sending, so re-runs and overlapping runs never double-notify. Until `0004` is applied the tasks that need it report an error in the cron response and email retry stays off.

- `/api/cron/npa-sync` (06:00): NPA knowledge crawl, then a health check that alerts staff on failed documents, unlistable sources, or a week with nothing new.
- `/api/cron/daily` (07:00): each task is isolated and idempotent (`src/lib/automation/`), and the JSON response lists every task's outcome. To run it by hand, send the secret in the `Authorization` header; note that this sends real emails.
  - `schema-check`: compares the migration ledger to the migrations this code requires and fails the run (developer-only: it appears in the cron log, not to staff) if the database is behind.
  - `paystack-reconcile`: re-checks online payments started in the last 7 days that never finalized (missed webhook) with Paystack; only Paystack-confirmed successes are finalized, mismatches still go to staff.
  - `subscription-sweep`: refreshes a stale billing period from Paystack, or alerts staff when a subscription has really ended. It never suspends anyone.
  - `auto-assign`: (when switched on) retries jobs still waiting for an inspector and moves a job to the next eligible inspector if the first hasn't accepted within the configured hours.
  - `auto-approve`: (only in Automatic mode) approves jobs whose checks passed at submission, still pass now, and have waited out the hold window. See [Assignment and approval automation](#assignment-and-approval-automation).
  - `invoice-reminders`: due-soon (3 days), 7 and 14 days overdue; the 14-day step also alerts Operations.
  - `ops-digest`: one daily list of stuck jobs, missing stock readings, approved-but-uninvoiced jobs, receipts waiting on verification and unconverted quotes; nudges an inspector once for an unanswered assignment or amendment.
  - `auto-close`: closes `paid` jobs 48h after payment once the CoQ exists and no invoice is open.
  - `email-retry`: re-sends transient email failures (body kept in `email_log`).
Other workflow automation that runs on user actions rather than the schedule:

- **Invoice on approval:** Admin > Settings > Invoice Settings has an "issue automatically" switch (off by default). When on, approving a job issues the invoice from the service's default price (Admin > Services). Jobs without a default price stay manual and appear in the daily digest.
- **Suggested inspector:** the manual assign form on a job preselects the active inspector with the fewest open jobs, then the most history with that client. A person still confirms with Assign. Fully automatic assignment is a separate, opt-in feature (below).
- **Form acknowledgements:** quote and contact submissions send the submitter a confirmation email.
- **Client account setup:** converting a quote to a job emails a one-time "choose your password" link (7 days) instead of a plaintext password; the temporary password is still shown to staff as a fallback.
- **Email delivery:** a transient provider failure is retried once immediately, then by the daily `email-retry` task.

Bank-transfer receipt verification (`verifyPayment` / `rejectPaymentSubmission`) is deliberately not automated: staff still verify or reject every receipt, and the digest only reminds them when one is waiting.

## Assignment and approval automation

Both are opt-in and off by default (Admin > Settings > Assignment & Approval Automation). They need migration `0005`; without it they stay inactive and the settings page says so. Every automatic action is written to the job timeline, listed in the next daily digest, and recorded in the audit log when a setting changes.

**Inspector auto-assignment.** Each inspector has an *Assignment profile* (Admin > Inspectors): services they are qualified for, regions they cover, most open jobs at once, an "away until" date, and an on/off switch. Nobody is auto-assigned until their switch is on. When a job arrives (portal request, quote conversion, admin create) or an inspector declines, the rules in `src/lib/assignment-rules.ts` pick an inspector: qualified for the service, location matches a region (no regions = anywhere), not away, under their job limit, and not already declined or timed out on this job. The best local match wins, then the lightest load, then the most history with that client. The timeline records who was chosen and why. If nobody fits, that is recorded once and the job waits for Operations. A job not accepted within the configured hours moves to the next eligible inspector (at most twice, then a person takes over); this runs in the daily job, so the real delay is "the first run after the limit". Matching depends on the job's service type, so every way of creating a job now sets one: the client portal and the admin **Create job** form use a dropdown, and **Convert to Job** (from a quote) preselects the service the visitor chose, using tolerant name matching (`src/lib/service-match.ts`, so "Stock Monitoring" finds "Stock Monitoring Services") and asking a person when it isn't sure. Staff can fill in or correct a job's service type, location and tank/depot afterwards in the **Job Details** card on the job page; for a job still waiting for an inspector, saving tries automatic assignment straight away. Migration `0006` fills in the service type on existing jobs where the name matches exactly one service.

**Approval, in three modes.**

- *Off:* nothing changes.
- *Shadow:* when an inspector submits work, the checks run and their verdict is stored; your team approves or returns the job as usual, and the decision is stored beside the verdict. Settings shows how often they agreed. Reviewers also see the checklist on the job page.
- *Automatic:* as Shadow, and the daily `auto-approve` task then approves a job only if all of these hold: the checks passed at submission, it has waited out the hold window, the checks still all pass when re-run, and it is still awaiting approval. It can only approve, never reject; anything doubtful stays for a person.

The checks (`src/lib/approval-checks.ts`): completion data submitted; required figures present; GSV within 10% of GOV and air/vacuum tonnes within 1%; first submission (never an amended resubmission); the AI quality review actually ran and raised nothing on the data or any document; an inspection report attached; the inspector's last N approved jobs (default 5) were never sent back; and the service is on the allowed list. Approving issues the Certificate of Quantity (and the invoice, if auto-invoicing is on), so the recommended path is Shadow for a few weeks, then Automatic for one or two low-risk services only. Switching Automatic off returns everything to manual immediately.

An AI review response that cannot be parsed is no longer stored as a clean "none" result, so a stored clean review now always means the model answered validly. Also in this area: inspectors can mark themselves away until a date from their own dashboard (**Your availability**) so nothing is assigned to them meanwhile; Operations get an immediate alert (once per job) when automatic assignment finds nobody suitable; the public quote form's service list, the client portal and the admin screens all read the same active services from the services table; admin jobs can carry an optional custom title; and whether an inspection report must be attached before a job may be auto-approved is a setting (on by default).

**Hourly timing (optional).** Vercel's plan only schedules once a day, so reassignment and the approval waiting period are otherwise checked at 07:00 UTC. `/api/cron/hourly` runs just the time-sensitive tasks (assignment sweep, auto-approve, email retry), and `.github/workflows/hourly-automation.yml` calls it every hour on GitHub's free schedule. To switch it on, add a repository secret named `CRON_SECRET` (same value as on the hosting platform) under GitHub > Settings > Secrets and variables > Actions. Until then the workflow does nothing and the daily run keeps working.

Two test scripts cover this without touching a real database: `node scripts/test-automation-rules.cjs` (the pure assignment, figure and service-name rules) and `node scripts/test-automation-flows.cjs`, which runs the real code, including the admin screens' actions, against an in-memory Postgres built from `src/db/schema.ts` (install its one dependency first with `npm i --no-save @electric-sql/pglite`; it is deliberately not a project dependency). The screens themselves are type-checked and built but there is no automated browser test.

## Database migrations

Schema changes are plain, idempotent SQL files in [`migrations/`](migrations/README.md), tracked in a `schema_migrations` ledger. The live database is changed through the Supabase SQL Editor, so each file records itself when pasted there. For a database you can reach from your machine:

```bash
npm run db:migrate                 # status: applied / PENDING / MODIFIED
npm run db:migrate -- up           # dry run
npm run db:migrate -- up --yes     # apply pending migrations
npm run db:migrate -- check        # lint the migrations folder (no database needed)
```

`DATABASE_URL` is often the live database, so `up` does nothing without `--yes`. The daily `schema-check` task fails, and shows in the cron log, if the deployed code needs a migration the database does not have, so apply migrations before (or right after) deploying code that needs them. See [migrations/README.md](migrations/README.md) for how to add one.

## Apple-inspired UI system

The interface follows Apple-caliber design principles adapted to the JDL Core brand. It does not reproduce Apple product pages or proprietary interface styling.

The system prioritizes:

- Immediate comprehension and strong information hierarchy
- Content-first layouts with generous, responsive spacing
- Deep navy, industrial gold, warm neutral surfaces, and restrained translucency
- Subtle borders and material separation instead of heavy shadows
- Comfortable touch targets and consistent keyboard focus states
- Purposeful motion that respects `prefers-reduced-motion`
- Responsive layouts designed separately for mobile and desktop
- Lucide icons rather than emoji, text glyphs, or improvised interface symbols
- Authentic JDL Core logo assets rendered with Next.js Image

Shared design tokens and cross-product surface rules live in `src/app/globals.css`. Tailwind remains the primary styling layer, while shadcn primitives provide accessible foundations for buttons, cards, fields, alerts, tables, sheets, menus, and related controls.

### Public experience

The public UI includes:

- JDL Core group landing page
- Inspection Services marketing site
- Analytics marketing and beta access pages
- Academy marketing site and public course catalogue
- Mobile app promo section on the group landing page (App Store / Google Play "coming soon" badges plus an email waitlist signup)
- Contact and lead-generation forms
- Shared translucent navigation, mobile drawers, and structured footers

### Authentication

Admin, Client Portal, Inspector Portal, Analytics, and Academy authentication screens use a shared two-column system:

- Context and product messaging on the left
- Login or registration form on the right
- A focused single-column form experience on mobile
- shadcn Input, Label, Button, Alert, and Card behavior
- Consistent validation, loading, password recovery, and focus treatments

### Authenticated workspaces

The backend UI uses a shared workspace language while preserving the navigation model appropriate to each product:

- Admin Command Center with responsive sidebar navigation, including a single Create Account form that issues staff, inspector, or client logins depending on the selected role
- Client Portal with job tracking, service requests, reports, documents, invoices, and comments
- Inspector Portal with assignment, fieldwork, and submission workflows
- Analytics chat workspace with citations, exports, conversation history, and paired mobile drawers
- Academy LMS with courses, assessments, progress, and certificates

Cards, tables, fields, navigation states, page gutters, and responsive behavior share the same backend tokens. Desktop top menus collapse into shadcn Sheet drawers on mobile.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Supabase project and add the required environment variables to `.env` or `.env.local`:

   ```env
   DATABASE_URL=
   ADMIN_PASSWORD=
   SESSION_SECRET=
   CRON_SECRET=        # only needed to call the scheduled routes yourself
   ```

   Paystack, email and AI provider keys can be set from the Admin Command Center; see `.env.example` for the optional environment fallbacks.

3. Create the database tables for a **new, empty** database, then install the migration ledger:

   ```bash
   npm run db:push
   npm run db:migrate -- up --yes
   ```

   For an existing database, use `npm run db:migrate` to see what is pending instead; see [Database migrations](#database-migrations). Do not run `db:push` against the live database.

4. Start the development server:

   ```bash
   npm run dev
   ```

Open `http://localhost:3000`.

## Project structure

```text
src/app/
  page.tsx                 Group landing page
  inspection/              Inspection marketing site
  analytics/               Marketing, subscriber auth, and chat workspace
  academy/                 Marketing, catalogue, learner auth, and LMS
  contact/                 Contact experience
  portal/                  Client authentication and workspace
  inspector/               Inspector authentication and workspace
  admin/                   Staff authentication and Command Center
  actions/                 Server Actions for platform workflows
  api/                     Documents, reports, chat, and certificate endpoints

src/components/
  auth/                    Shared authentication shell
  backend/                 Shared authenticated mobile navigation
  ui/                      shadcn interface primitives
  admin/                   Admin components and forms
  portal/                  Client Portal components
  inspector/               Inspector workflow components
  analytics/               Analytics chat and authentication UI
  academy/                 Academy authentication and LMS UI

src/db/                    Drizzle client and schema
src/lib/                   Authentication, business logic, reporting, and settings
src/lib/automation/        Scheduled tasks, idempotency ledger, and cron auth
migrations/                Ordered, idempotent SQL migrations and the ledger
scripts/                   Migration runner (migrate.cjs), legacy migrations, and seeds
_legacy/                   Original static site retained for reference
```

## Quality checks

```bash
npm run lint
npm run build
npm run db:migrate -- check
```

The production build performs compilation, type checking, route generation, and page optimization. The repository-wide lint command may also scan generated Netlify or temporary browser artifacts if those directories exist locally; targeted source linting can be run with `npx eslint src`.

## Deployment

- Configure production environment variables on the hosting provider, including `CRON_SECRET`.
- Apply any pending migrations to the production database (see [Database migrations](#database-migrations)), ideally before the deploy that needs them.
- The scheduled jobs are configured in `vercel.json` and only run on Vercel. The project also includes Netlify configuration, and the Next.js application can be deployed to any compatible host, but without Vercel Cron the automations do not run unless something else calls `/api/cron/daily` and `/api/cron/npa-sync` with the `CRON_SECRET` header.
- Do not commit `.env`, `.env.local`, temporary browser data, generated platform output, or private client documents.

## Current asset note

All four brand marks (JDL Core group, Inspection Services, Analytics, and Academy) use supplied logo assets rendered with Next.js Image, cropped tight and to a consistent scale across headers, footers, division cards, and authentication forms.
