"use client";

import { useActionState } from "react";
import { addJobComment } from "@/app/actions/portal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export type PortalComment = {
  id: number;
  authorName: string;
  authorType: string;
  body: string;
  createdAt: string | Date;
};

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function PortalComments({ jobId, comments }: { jobId: number; comments: PortalComment[] }) {
  const [state, action, pending] = useActionState(addJobComment, initial);
  return (
    <div className="flex flex-col gap-3">
      {comments.length === 0 ? (
        <p className="m-0 rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground" style={{ borderColor: "var(--border)" }}>
          No comments yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-[var(--radius)] border bg-white p-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-navy-950">{c.authorName}</span>
                <span className="text-xs text-ink-faint">{dateTimeFmt.format(new Date(c.createdAt))}</span>
              </div>
              <p className="m-0 mt-1 text-sm text-ink-soft">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <Textarea name="body" rows={2} placeholder="Add a comment…" required />
        <Button type="submit" disabled={pending} variant="outline" className="self-start">
          {pending ? "Posting…" : "Add Comment"}
        </Button>
        {state.message && !state.ok && (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
      </form>
    </div>
  );
}
