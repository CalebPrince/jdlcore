"use client";

import { useActionState } from "react";
import Link from "next/link";
import { approveProposedAction, rejectProposedAction } from "@/app/actions/reviewed-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export type PendingProposalView = {
  id: number;
  summary: string;
  targetLink: string;
  proposedByName: string | null;
  createdAtLabel: string;
};

export type DecidedProposalView = PendingProposalView & {
  status: string;
  reviewedByName: string | null;
  reviewNote: string | null;
  executionMessage: string | null;
};

function Feedback({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert
      variant={state.ok ? undefined : "destructive"}
      className={state.ok ? "border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]" : undefined}
    >
      <AlertDescription className={state.ok ? "text-[#1f7a4d]" : undefined}>{state.message}</AlertDescription>
    </Alert>
  );
}

function ProposalRow({ proposal }: { proposal: PendingProposalView }) {
  const [approveState, approveAction, approvePending] = useActionState(approveProposedAction, initial);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectProposedAction, initial);

  return (
    <div className="rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm text-navy-950">{proposal.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Proposed by {proposal.proposedByName ?? "an agent session"} · {proposal.createdAtLabel} ·{" "}
            <Link href={proposal.targetLink} className="font-semibold text-gold-700 hover:underline">
              Open record
            </Link>
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
        <form action={approveAction} className="flex-1">
          <input type="hidden" name="proposalId" value={proposal.id} />
          <Button type="submit" disabled={approvePending || rejectPending} className="btn-gold w-full sm:w-auto">
            {approvePending ? "Approving…" : "Approve"}
          </Button>
          <Feedback state={approveState} />
        </form>
        <form action={rejectAction} className="flex flex-1 flex-col gap-2">
          <Textarea name="note" rows={2} placeholder="Rejection note (required)…" required disabled={rejectPending} />
          <input type="hidden" name="proposalId" value={proposal.id} />
          <Button type="submit" variant="outline" disabled={approvePending || rejectPending} className="self-start">
            {rejectPending ? "Rejecting…" : "Reject"}
          </Button>
          <Feedback state={rejectState} />
        </form>
      </div>
    </div>
  );
}

export function ReviewedActionsPanel({
  pending,
  decided,
}: {
  pending: PendingProposalView[];
  decided: DecidedProposalView[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Pending review ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing is waiting on a decision right now.</p>
          ) : (
            pending.map((p) => <ProposalRow key={p.id} proposal={p} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Recent decisions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {decided.length === 0 ? (
            <p className="text-sm text-muted-foreground">No proposals have been decided yet.</p>
          ) : (
            decided.map((p) => (
              <div key={p.id} className="rounded-lg border p-3 text-sm">
                <p className="text-navy-950">{p.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wide">{p.status}</span> · Proposed by{" "}
                  {p.proposedByName ?? "an agent session"} · {p.createdAtLabel}
                  {p.reviewedByName ? ` · Reviewed by ${p.reviewedByName}` : ""}
                  {" · "}
                  <Link href={p.targetLink} className="font-semibold text-gold-700 hover:underline">
                    Open record
                  </Link>
                </p>
                {p.reviewNote && <p className="mt-1 text-xs text-muted-foreground">Note: {p.reviewNote}</p>}
                {p.executionMessage && <p className="mt-1 text-xs text-muted-foreground">{p.executionMessage}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
