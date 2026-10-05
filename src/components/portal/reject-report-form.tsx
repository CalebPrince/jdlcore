"use client";

import { useActionState } from "react";
import { rejectReport } from "@/app/actions/portal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

/** Lets the client reject the issued report with a reason. Collapsed by default so it isn't pressed by accident. */
export function RejectReportForm({ jobId }: { jobId: number }) {
  const [state, action, pending] = useActionState(rejectReport, initial);
  return (
    <details className="rounded-[var(--radius)] border bg-white p-4" style={{ borderColor: "var(--border)" }}>
      <summary className="cursor-pointer text-sm font-semibold text-navy-950">Something wrong with this report? Reject it</summary>
      <form
        action={action}
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          if (!window.confirm("Reject this report and send your reason to Operations? Payment will be paused while they review it.")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="jobId" value={jobId} />
        <p className="m-0 text-sm text-muted-foreground">
          Tell Operations what is wrong. They will either have the inspector amend the report or reply with an
          explanation. Payment on this job is paused until they respond.
        </p>
        <Label htmlFor={`reject-report-${jobId}`}>Reason for rejecting (required)</Label>
        <Textarea
          id={`reject-report-${jobId}`}
          name="reason"
          rows={3}
          minLength={10}
          maxLength={2000}
          required
          placeholder="The quantity shown for TK-102 does not match our own gauging…"
        />
        <Button type="submit" variant="outline" disabled={pending} className="self-start border-red-300 text-red-700 hover:bg-red-50">
          {pending ? "Sending…" : "Reject Report"}
        </Button>
        {state.message && (
          <Alert
            variant={state.ok ? undefined : "destructive"}
            className={state.ok ? "border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]" : undefined}
          >
            <AlertDescription className={state.ok ? "text-[#1f7a4d]" : undefined}>{state.message}</AlertDescription>
          </Alert>
        )}
      </form>
    </details>
  );
}
