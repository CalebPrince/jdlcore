# Platform knowledge

The public AI assistant and Analytics assistant load shared company and division descriptions on each request. This is prompt context, not model training, access to live records, or an autonomous tool system.

Superadmins can edit it under **Admin > AI Settings > Platform knowledge**. The initial code-based baseline describes Inspection Services, Analytics, and Academy. Its business review notes identify facts that need business confirmation. Version 0 means the baseline has not yet been published by an administrator.

Each division has a stable identifier, purpose, capabilities, workflow, roles, pages, limitations, and Admin-only review notes. All other fields must contain public product information. Private client data and confidential procedures belong in access-controlled systems, not this registry. Publishing does not create application routes or grant action permissions.

Save draft preserves the published snapshot. Publish knowledge validates and replaces it, increments the published version, records the editor and publication time, and logs the event in the existing settings audit. The editor rejects stale revisions. Removing a division from a draft only affects assistants after publication. The current implementation stores the current draft and published snapshot, not a historical version archive.

Storage uses the existing settings table with key `ai_platform_knowledge_v1`; no schema migration is needed. With no stored registry, code defaults apply. A database/read/validation failure produces a limited unavailable-context instruction rather than silently restoring an older baseline. The Admin editor reports load failure and does not offer an overwrite form.

The context includes every published division (maximum 30) so follow-up and cross-division questions remain understandable without fragile keyword routing. Admin-only review notes are excluded before model submission. Context is bounded by field and division limits; a larger catalogue should adopt permission-aware retrieval and an explicit token budget.

Existing scripted browser fallback responses are separate from the AI prompts and do not load custom divisions. A configured AI provider is required for dynamic knowledge responses. Changes to workflow code should include a review of this registry; published overrides are not automatically rewritten by deployments.

Validation: `node scripts/test-platform-knowledge.cjs`, `npx tsc --noEmit --incremental false`, and targeted ESLint. Before production rollout, use an authorized test account to save a draft, verify that assistant answers still reflect the published snapshot, publish, and ask about the changed and newly added divisions. Include questions asking for another client's records and instructions embedded in reference material; the registry itself grants no access or tool execution.
