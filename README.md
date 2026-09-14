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
- Lucide icons
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
- **Admin operations assistant** — a staff-only, read-only chat under **Admin > Assistant** that looks up permitted jobs, AI quality-review flags, tank-gauge stock readings, and reference documents, citing every claim with a `[Ref n]` link back to the underlying record. It cannot approve, assign, notify, or otherwise change anything. Runs in keyword-routed lookup mode by default; once an administrator validates a provider for agent tool calls, it runs as a bounded, step/time/token-limited agent that chooses its own tool calls instead.

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

- By default this runs in **lookup mode**: application code reads the caller's message with keyword routing, runs scoped Drizzle queries for whichever domains it recognises (jobs, AI review flags, stock readings, reference documents), and only then hands the model a fixed evidence block to answer from — the model never decides what to query. Once an administrator validates a provider for agent tool calls (see the Bounded agent runner section below), the same assistant instead runs in **agent mode**, letting the model choose which of those same read tools to call itself, in a bounded loop — the request/response shapes and access model are unchanged either way, only who decides what to look up.
- Every read tool (`src/lib/ai/admin-assistant-tools.ts`) independently re-checks that the caller is an active staff member before running its query, rather than relying solely on the page/route check.
- Replies must cite every factual claim with an exact `[Ref n]` marker linking to the underlying record; the evidence a reply was grounded in is persisted alongside it and rendered as clickable links in the UI.
- A review-flag search only ever returns severities above `none` — a `none` row can mean either "nothing to flag" or a failed parse of the model's own review response (see `src/lib/ai/document-review.ts`), so the assistant is instructed never to say a job "passed review" from an absence of flags.
- Reference-document search does not reuse `retrieveKnowledge()` from `src/lib/analytics-knowledge.ts` as-is: that function scopes an Analytics subscriber to "global" plus their own client's documents, whereas an admin is not a subscriber of any one client and should see every ready document, so a sibling admin-scoped search was written instead.
- Conversation history persists per staff member (`admin_assistant_chats` / `admin_assistant_messages`; run `npm run db:migrate:admin-assistant`), mirroring the existing Analytics chat schema.
- This is a read-only lookup tool with no write access to any table. It cannot approve, assign, notify, or message anyone — the roadmap's step 5 ("reviewed actions") is what would eventually let a proposed action be prepared for a human to approve.

Validation completed for this change: production build, TypeScript checking, targeted ESLint, and `node scripts/test-admin-assistant.cjs`. Tests cover job-reference/severity extraction and day-arithmetic helpers; independent access enforcement on all four read tools; each tool's evidence formatting (including that stock-reading figures are rendered verbatim from storage, never recomputed by the model); the prompt builder's citation and empty-evidence framing; and keyword-domain routing, including the job-reference/severity extraction threaded through to the tools, the fallback to a jobs lookup when no domain keyword is recognised, and honest reporting of domains that were searched but came back empty. Not yet live-verified in the running application the way the Platform knowledge rollout was in step 1 — do that before relying on it operationally, including confirming Gemini or Anthropic is enabled (Groq alone is fine here, since this feature is text-only, unlike the vision-dependent quality-review and stock-import features).

### Bounded agent runner — implemented

Roadmap step 4 ("Build a bounded agent runner"). See [Bounded agent runner](docs/agent-runner.md) for the per-provider tool-calling formats, limit semantics, and known caveats.

- Extends the provider gateway (`src/lib/ai/gateway.ts`) with structured tool calls: `runAgentStep()` sends an abstract `AgentTurn[]`/`ToolDefinition[]` and gets back parsed text and/or `ToolCall[]` plus token usage, with each of Gemini, Anthropic, and Groq mapped to its own request/response shape independently (function calling, tool use, and OpenAI-style tools respectively) — this is separate code from the existing plain-chat `runCompletion()`, so it cannot change the request shape any already-shipped feature sends.
- **Providers are opt-in per feature, not just per key.** A provider already enabled for plain chat is *not* automatically usable for agent runs — Admin > AI Settings has a new, separate "Validated for agent tool calls" switch per provider, off by default for all three. `buildAgentLegs()` only includes a provider once that switch is on, since each provider's tool-calling mapping is hand-written from API documentation and has not been exercised against a live API in this codebase; an administrator should test the Admin Operations Assistant in agent mode against a specific provider before flipping its switch.
- `src/lib/ai/agent-runner.ts`'s `runBoundedAgent()` runs the loop: call the model, execute any tool calls it requests, feed results back, repeat — enforcing a **step limit** (default 6 model turns), a **wall-clock limit** (default 45s), and a **token budget** (default 20,000 input+output tokens) as a stand-in "spending" limit, since this app has no metered per-token billing wired in anywhere to spend real money against.
- Every step (including every tool call and its result) is persisted to new `agent_runs` / `agent_steps` tables as it happens — a run that hits a limit or fails mid-way still leaves a complete audit trail, not just the final answer (migration: `npm run db:migrate:agent-runner`).
- `[Ref n]` citation numbers are assigned globally across the whole run (not reset per tool call), so a final answer citing evidence gathered across multiple tool calls or steps never has two different records sharing the same ref number.
- The only tools available today are the same four read-only lookups from the Admin operations assistant above (jobs, AI review flags, stock readings, reference documents) — this stays within "read tools" the way the roadmap ordered it. Step 5 ("reviewed actions") is what would eventually let the agent prepare a write for a human to approve; nothing here can write to any table.
- Wired into the existing Admin Operations Assistant (`/api/admin/assistant`): if any provider is validated for agent tool calls, that request runs in agent mode; otherwise, or if the agent run itself fails, it falls back to the step-3 lookup mode transparently. Each chat message currently starts a fresh agent run from just that message — prior turns in the same conversation are not (yet) threaded into the tool-calling loop, a known simplification called out in the docs page.

Validation completed for this change: production build, TypeScript checking, targeted ESLint, and `node scripts/test-agent-runner.cjs`. Tests cover per-provider tool-call request/response mapping (including a full round trip of a tool call and its fed-back result) for Gemini, Anthropic, and Groq against a stubbed `fetch`; that an enabled-but-unvalidated provider is never used for agent runs; empty/truncated tool responses failing rather than returning partial data; failover across providers within a single step; the agent-tools-validated setting defaulting off per provider and round-tripping independently; the tool dispatcher rejecting unknown tool names and invalid arguments; and the bounded runner's natural completion, step-limit cutoff, token-budget cutoff, tool-execution-error handling, total-failure handling, and global ref-numbering, each verified against a fully in-memory fake database. Not yet live-verified against a real provider (no provider is validated in any deployed environment yet — that is a prerequisite an administrator must complete deliberately, not a gap in this change).

### What to implement next

These are planned steps, not currently available agent features:

1. ~~**Validate the knowledge in the running application.**~~ Done — see the live rollout check above.
2. ~~**Improve knowledge lifecycle and retrieval.**~~ Done — revision history and rollback, exact-context preview, a manual needs-review flag, and token-budgeted retrieval are implemented and tested; see the Platform knowledge foundation section above and [docs/platform-knowledge.md](docs/platform-knowledge.md). Not yet live-verified in the running application the way step 1 was — the catalogue is still below the retrieval budget, so ranking/trimming hasn't been exercised against real traffic.
3. ~~**Add authorized read tools.**~~ Done — an Admin operations assistant with independently access-checked read tools for jobs, AI review flags, stock readings, and reference documents, evidence-linked citations, and per-staff conversation history; see the Admin operations assistant section above. Not yet live-verified in the running application the way step 1 was.
4. ~~**Build a bounded agent runner.**~~ Done — structured tool calls in the provider gateway for Gemini, Anthropic, and Groq, a per-provider admin-validated gate before any provider is used for agent runs, persisted runs/steps, and step/time/token limits; see the Bounded agent runner section above. Not yet live-verified against a real provider — that requires an administrator to deliberately validate one first.
5. **Introduce reviewed actions.** Reuse business services and job transition rules to prepare exact proposed changes. Recheck permissions and record state at approval time, prevent duplicate execution on retries, and retain durable action records. Keep inspection approval, payment verification, report issuance, and external messages under explicit staff control initially.
6. **Add reliable background monitoring.** Introduce a durable worker and scheduler for job follow-ups and stock exceptions, with retries, deduplication, and actionable notifications. Expand to client and learner assistance after access controls and accuracy are verified.

Before relying on automated inspection review, distinguish invalid or failed AI reviews from a successful review with severity `none`. Improve document retrieval beyond the current keyword-ranked chunk sample before using it for broad investigations.

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

- Admin Command Center with responsive sidebar navigation
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
   ```

3. Create or update the database tables:

   ```bash
   npm run db:push
   ```

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
scripts/                   Migrations, seeds, and maintenance scripts
_legacy/                   Original static site retained for reference
```

## Quality checks

```bash
npm run lint
npm run build
```

The production build performs compilation, type checking, route generation, and page optimization. The repository-wide lint command may also scan generated Netlify or temporary browser artifacts if those directories exist locally; targeted source linting can be run with `npx eslint src`.

## Deployment

- Configure production environment variables on the hosting provider.
- Run the required migrations against the production database.
- The project includes Netlify configuration, but the Next.js application can be deployed to any compatible host.
- Do not commit `.env`, `.env.local`, temporary browser data, generated platform output, or private client documents.

## Current asset note

All four brand marks (JDL Core group, Inspection Services, Analytics, and Academy) use supplied logo assets rendered with Next.js Image, cropped tight and to a consistent scale across headers, footers, division cards, and authentication forms.
