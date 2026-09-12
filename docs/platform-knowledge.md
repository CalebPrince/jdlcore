# Platform knowledge

The public AI assistant and Analytics assistant load shared company and division descriptions on each request. This is prompt context, not model training, access to live records, or an autonomous tool system.

Superadmins can edit it under **Admin > AI Settings > Platform knowledge**. The initial code-based baseline describes Inspection Services, Analytics, and Academy. Its business review notes identify facts that need business confirmation. Version 0 means the baseline has not yet been published by an administrator.

Each division has a stable identifier, purpose, capabilities, workflow, roles, pages, limitations, an Admin-only review-notes field, and an Admin-only "needs review" flag with a short note. All other fields must contain public product information. Private client data and confidential procedures belong in access-controlled systems, not this registry. Publishing does not create application routes or grant action permissions.

Save draft preserves the published snapshot. Publish knowledge validates and replaces it, increments the published version, records the editor and publication time, and logs the event in the existing settings audit. The editor rejects stale revisions. Removing a division from a draft only affects assistants after publication.

Storage uses the existing settings table with key `ai_platform_knowledge_v1`; no schema migration is needed. With no stored registry, code defaults apply. A database/read/validation failure produces a limited unavailable-context instruction rather than silently restoring an older baseline. The Admin editor reports load failure and does not offer an overwrite form.

### Revision history and rollback

Every publish snapshots the version it replaces onto a `history` list (newest first, capped at 20 entries), including the very first publish, which snapshots the code baseline as version 0. The Admin editor can show this history and roll back to any retained version. A rollback is implemented as a normal publish of that old content: it always moves the published version number forward and adds a new history entry for whatever it replaced, so history never has to be edited or rewritten in place. Rolling back updates the draft to match, so the editor reflects what is actually live. Because history is capped, very old versions eventually age out and cannot be rolled back to.

### Preview exact context

The Admin editor can render the exact context string `renderPlatformKnowledge` would send to the assistants for the draft currently being edited, computed client-side with no server round trip and no publish required. The preview shown is the unranked, un-budgeted form (as if the catalogue were small enough that nothing needed to be trimmed) so an editor can review full content; the live system applies the budget described below on every request.

### Needs-review flag

Each division carries a manual `needsReview` boolean and a short note, set by an admin (for example, after touching the application code a division's business review notes reference). This is a human-set flag surfaced as a badge in the editor, not an automatic link between code changes and divisions — nothing currently detects that link for you.

### Token-budgeted retrieval

The context includes every published division so long as the full rendered set fits within a character budget (`DEFAULT_CONTEXT_BUDGET_CHARS`, currently 12,000 — comfortably above today's three-division catalogue). Once the catalogue grows past that budget, divisions are ranked by term overlap between the caller's latest message and each division's name/purpose/capabilities/workflow/limitations (name matches weighted higher), and only the top-ranked divisions are included in full; at least one division is always included even under an extreme budget. Divisions left out are named in a trailing line so the assistant can say "not detailed here" rather than "does not exist." The company overview is always included regardless of budget. The public chat assistant and the Analytics assistant both pass the caller's latest message through so retrieval is aware of what was actually asked.

Existing scripted browser fallback responses are separate from the AI prompts and do not load custom divisions. A configured AI provider is required for dynamic knowledge responses. Changes to workflow code should include a review of this registry (and setting the needs-review flag on the affected division); published overrides are not automatically rewritten by deployments.

Validation: `node scripts/test-platform-knowledge.cjs`, `npx tsc --noEmit --incremental false`, and targeted ESLint. The test script covers the knowledge schema (including needs-review defaults and round-trip), retrieval ranking and budget trimming, the store's published-only context and outage handling, and the admin actions' history accrual, stale-revision rejection, rollback (including to the code baseline), missing-version rollback, and the superadmin-only gate. Before production rollout, use an authorized test account to save a draft, verify that assistant answers still reflect the published snapshot, publish, and ask about the changed and newly added divisions. Include questions asking for another client's records and instructions embedded in reference material; the registry itself grants no access or tool execution.
