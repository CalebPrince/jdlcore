# Admin operations assistant

A staff-only, read-only chat at **Admin > Assistant** that answers questions about permitted jobs, AI quality-review flags, tank-gauge stock readings, and reference documents. It is roadmap step 3 ("Add authorized read tools") from the README's AI roadmap. It cannot approve, assign, notify, or otherwise change anything — it only looks things up and cites where it found them.

## Why it isn't an autonomous agent

The provider gateway (`src/lib/ai/gateway.ts`) has no structured tool-calling support for any of Gemini, Anthropic, or Groq — that is roadmap step 4 ("Build a bounded agent runner"), not yet built. So the assistant does not let the model decide what to query. Instead, on every message:

1. `src/lib/ai/admin-assistant.ts` classifies the message against four keyword-matched domains (jobs, review flags, stock readings, reference documents) and extracts a job reference (`JDL-YYYY-NNNN`) or severity word (`low`/`medium`/`high`) if present.
2. It calls the matching read tools in `src/lib/ai/admin-assistant-tools.ts`, each a plain, scoped Drizzle query — no query is chosen or written by the model.
3. The results become a fixed "EVIDENCE" block in the system prompt (`src/lib/ai/admin-assistant-prompt.ts`), and only then is the model asked to answer, strictly from that block, citing each claim with `[Ref n]`.

If no domain keyword is recognised, the assistant still runs a jobs lookup rather than returning nothing, since jobs are the most common thing staff ask about.

## Access enforcement

`src/app/api/admin/assistant/route.ts` requires an active staff session (`getStaff()`) before doing anything. On top of that, every read tool in `admin-assistant-tools.ts` independently re-checks that the caller is an active staff member (`assertStaffAccess`) before running its query — so a tool called incorrectly, or reused elsewhere later, cannot silently skip the check. There is currently no client- or role-based partitioning of jobs/flags/readings visibility anywhere in the admin dashboard (any active staff member — superadmin, administrator, or operations — already sees every job), so the tools mirror that rather than inventing a narrower scope that the rest of the admin UI doesn't have.

## Evidence and citation

Every tool returns `EvidenceItem[]`: `{ kind, label, detail, link }`. `link` points back into the admin UI (`/admin/jobs/{id}` today) so staff can open the underlying record instead of trusting the summary. The system prompt requires the model to cite every factual claim with the item's `[Ref n]` marker and forbids citing an item that wasn't used. The evidence list for each assistant reply is stored alongside it (`admin_assistant_messages.evidence`) and rendered as clickable chips in the UI.

## Known caveats

- **Review flags and "none" severity.** `src/lib/ai/document-review.ts` stores a row with `severity: "none"` both when a review genuinely found nothing, and when the model's JSON response failed to parse. The two are indistinguishable in storage today. The review-flags tool only ever returns rows above `none`, and the assistant is explicitly instructed never to say a job "passed" or is "clean" from an absence of flags — only that no flags were found for the search.
- **Reference-document scope.** `retrieveKnowledge()` in `src/lib/analytics-knowledge.ts` scopes a subscriber to "global" documents plus their own client's — passing `clientId: null` there means "global only," not "no filter." An admin isn't a subscriber of any one client and should see every ready document regardless of scope, so `searchReferenceDocuments()` in `admin-assistant-tools.ts` is a separate, admin-scoped query rather than a reuse of `retrieveKnowledge()`.
- **Keyword search, not semantic search.** Both job/flag/reading lookups (substring/`ilike` matching) and reference-document lookups (keyword-overlap scoring) are simple text matching, not embeddings — the same limitation the README already calls out for Analytics document retrieval. Treat results as a starting point for a broad investigation, not a guarantee of completeness.
- **In-memory rate limiting.** The route reuses `rateLimit()` from `src/lib/ai/rate-limit.ts`, an in-memory, per-instance limiter keyed by staff id — it resets on restart and isn't shared across multiple server instances. Acceptable for internal staff usage at current scale; revisit if the admin dashboard ever runs on more than one instance under real load.

## Storage

Conversation history uses two new tables, `admin_assistant_chats` and `admin_assistant_messages` (mirroring `analytics_chats`/`analytics_messages`), scoped to `staff.id`. Unlike Platform knowledge (which reuses the generic `settings` table), this does need a migration: run `npm run db:migrate:admin-assistant` before using the feature against a database that doesn't have these tables yet (or `npm run db:push`, which will pick up the new tables from `src/db/schema.ts` directly).

## Validation

`node scripts/test-admin-assistant.cjs` covers: job-reference/severity extraction and the day-arithmetic helper; independent access enforcement on all four read tools; each tool's evidence formatting (including that stock-reading figures are rendered exactly as stored, never recomputed by the model); the prompt builder's citation instructions and empty-evidence framing; and keyword-domain routing, including job-reference/severity extraction threaded through to the tools, the fallback to a jobs lookup when no domain keyword matches, and honest reporting of domains that were searched but came back empty.
