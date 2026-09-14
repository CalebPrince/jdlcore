# Reviewed actions

Roadmap step 5 ("Introduce reviewed actions"). A durable, human-reviewable pipeline for a write the agent (or, in future, another automated caller) wants to make — never executed on its own. One action type is wired to it so far: **job approval**.

## Why this exists

The bounded agent (roadmap step 4) can look things up but had no way to act. This step adds exactly one narrow escape hatch: the agent can *propose* a write, but a human must review and approve it before it happens. The roadmap is explicit that inspection approval, payment verification, report issuance, and external messages should stay under explicit staff control "initially" — this is that control, implemented as a real, durable pipeline rather than a policy nobody enforces.

## The lifecycle

Every proposal is one row in `proposed_actions` (`src/db/schema.ts`), moving through a small set of statuses:

```
pending → approved → executing → executed
   |                                 ↘
   ├→ stale (target state changed since proposed)   → failed
   └→ rejected
```

1. **Propose** (`proposeJobApproval` in `src/lib/reviewed-actions.ts`): loads the target, re-runs the relevant job-workflow transition check (`checkJobApprovable`, which wraps `canTransition` from `src/lib/job-workflow.ts` — the same rule the ordinary "Approve" button on a job uses), and refuses to create a proposal at all if the transition wouldn't be valid. If it would, it inserts a `pending` row with:
   - `payload` — the exact parameters execution will need (`{ jobId }`), not free text.
   - `proposedState` — a snapshot of the target at proposal time (`{ status, ref }`), for a later staleness check.
   - `summary` — a human-readable description of exactly what approving will do, for the reviewer.
   - `agentRunId` / `proposedByStaffId` — which agent run (if any) and which staff member's session produced it.

2. **Approve** (`approveProposal`): a staff member on **Admin > Reviewed Actions** clicks Approve. This is where every roadmap requirement for this step is enforced, in order:
   - **Recheck permission at approval time.** Each action type in the `HANDLERS` registry declares its own `requiredRoles`; the reviewer's current role is checked against that — never inherited from anything decided at proposal time.
   - **Recheck target state at approval time.** The handler's `recheck()` re-verifies the target is still valid for this action *right now*, independently of `proposedState` — because real time has passed, and someone else may have already changed the target through the ordinary staff UI. If it fails, the proposal is atomically marked `stale` with the reason, and never executes.
   - **Record state at approval time.** A fresh snapshot (`approvedState`) is captured at the moment of approval, alongside `reviewedByStaffId` and `reviewedAt` — a durable record of exactly what the reviewer was looking at, independent of and possibly different from `proposedState`.
   - **Prevent duplicate execution on retries.** Every status transition is an atomic, conditional database update (`claimTransition`): `UPDATE proposed_actions SET status = '<to>' WHERE id = ? AND status = '<from>'`. A caller only "wins" a transition if the row was still in the expected state; a retried approval call, a double-click, or a race between two reviewers all resolve to at most one execution. The pipeline claims `pending → approved` and then `approved → executing` as two separate guarded steps before ever calling the handler's `execute()`, specifically so a second concurrent or retried call can never slip through and run it again.
   - **Execute**, using the handler's `execute()` — for `job_approval`, this is `approveJobCore()` (see below). On success the row becomes `executed` with `executionResult`; on a thrown error, `failed` with the error captured in `executionResult` rather than lost.

3. **Reject** (`rejectProposal`): the same permission recheck, requires a non-empty note (mirroring the existing `rejectJob` Server Action's own comment requirement), and atomically claims `pending → rejected`.

Every field above stays on the one row — "retain durable action records" means a single `SELECT` shows a proposal's whole history, not scattered log lines.

## Reusing business services exactly, not reimplementing them

The roadmap says to reuse business services and job-workflow transition rules "to prepare exact proposed changes" — this is implemented literally, not just in spirit:

- The original `approveJob` Server Action (`src/app/actions/job-workflow.ts`) had its entire state-changing logic — set the job to `approved` then straight through to `report_issued`/`invoice_issued`, write the job-timeline entries, generate the Certificate of Quantity and invoice via `generateCoqAndInvoice()` (which itself notifies the client) — extracted verbatim into `approveJobCore()` in the new `src/lib/job-actions.ts`. `approveJob` is now a five-line wrapper that authenticates the caller and calls `approveJobCore()`.
- `reviewed-actions.ts`'s `approveProposal()` calls that exact same `approveJobCore()` function to execute a `job_approval` proposal. There is exactly one implementation of "approve a job" in the codebase, used by both the direct staff button and the reviewed-actions pipeline.
- `checkJobApprovable()` (also in `job-actions.ts`) wraps `canTransition()` from `src/lib/job-workflow.ts` — the same pure transition-rule function every other job-status change in the app already goes through. It is called once at proposal time (to decide whether a proposal should exist at all) and once again, independently, at approval time (the staleness recheck).

Because `approveJobCore()` calls `generateCoqAndInvoice()`, one reviewed action type in this codebase already reaches three of the roadmap's four named categories through a single reused flow: **inspection approval** (the job status transition), **report issuance** (the Certificate of Quantity), and an **external message** (the client notification email `generateCoqAndInvoice()` sends). Payment verification (`verifyPayment` in `job-workflow.ts`) is the natural next entry to add to the registry, following the exact same extract-a-core-function-and-add-a-`HANDLERS`-entry pattern.

## The registry

```ts
type ActionHandler = {
  requiredRoles: StaffRole[];
  recheck: (payload) => Promise<{ ok: true; state } | { ok: false; message }>;
  execute: (payload, staff) => Promise<{ ok: boolean; message: string }>;
};
```

Adding a new reviewable action type (payment verification, report issuance as its own action, an outbound message) means: extract its existing Server Action's core logic into a plain function the way `approveJobCore()` was extracted, write a `recheck()` that re-runs whatever validation already guards that action, and add one entry to `HANDLERS` in `src/lib/reviewed-actions.ts`. Nothing about the proposal lifecycle, permission/state rechecking, or idempotency guarantee needs to change — those are generic across every action type.

## Wired into the agent

`src/lib/ai/agent-tools.ts` adds a fifth tool, `propose_job_approval`, alongside the four step-3 read tools. It takes a human-readable `jobRef` (e.g. `JDL-2026-0042` — what the model actually sees in evidence text) and a `reasoning` string, resolves the ref to a numeric job id (`findJobIdByRef()` in `job-actions.ts`), and calls `proposeJobApproval()`. It never calls `approveProposal()` — that tool doesn't exist for the agent. The system prompt (`buildAdminAgentSystemPrompt()` in `src/lib/ai/admin-assistant-prompt.ts`) instructs the model to only propose when explicitly asked, to check the job's status and review flags first via the read tools, and to always tell the user plainly that filing a proposal is not the same as approving it.

## Admin UI

**Admin > Reviewed Actions** (`src/app/admin/(dashboard)/actions/page.tsx`) lists pending proposals with Approve/Reject controls (`src/components/admin/reviewed-actions-panel.tsx`, one `useActionState` pair per row) and a recent-decisions history showing status, reviewer, any rejection note, and the execution result. The Server Actions (`src/app/actions/reviewed-actions.ts`) authenticate the caller with `getStaff()` and delegate the actual role check to `approveProposal()`/`rejectProposal()`, since the required role depends on the specific action type, not a single fixed gate.

## Storage

One new table, `proposed_actions` (migration: `npm run db:migrate:reviewed-actions`, or `npm run db:push`).

## Validation

`node scripts/test-reviewed-actions.cjs` covers `job-actions.ts` directly — ref lookup, the real `job-workflow.ts` transition rule (not a reimplementation), and the full side effects of `approveJobCore()` (status, timeline entries, Certificate of Quantity/invoice generation, cache revalidation) — and `reviewed-actions.ts` in isolation, with `job-actions.ts` stubbed so the generic pipeline is tested independently of job-approval specifics: refusing to propose against a non-transitionable target; rechecking the transition rule a second time at approval and recording an approval-time snapshot; refusing a reviewer without the right role before anything executes; marking a proposal stale rather than executing when the target changed; a retried approval call never re-executing the underlying action; a thrown execution error being durably recorded rather than lost; and rejection requiring a note, rechecking permission, and being final once decided.

Not yet live-verified in the running application. Before relying on it: validate a provider for agent tool calls (see [docs/agent-runner.md](agent-runner.md)), ask the assistant in agent mode to propose approving a real job that's awaiting approval, and confirm both an approval and a rejection behave as expected from Admin > Reviewed Actions.
