"use client";

import { useActionState } from "react";
import {
  assignInspector,
  approveJob,
  closeJob,
  overrideJobStatus,
  rejectJob,
  rejectPaymentSubmission,
  verifyPayment,
} from "@/app/actions/job-workflow";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JOB_STATUSES, JOB_STATUS_META, type JobStatus } from "@/lib/jobs";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

function Feedback({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert
      variant={state.ok ? undefined : "destructive"}
      className={state.ok ? "border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]" : undefined}
    >
      <AlertDescription className={state.ok ? "text-[#1f7a4d]" : undefined}>
        {state.message}
      </AlertDescription>
    </Alert>
  );
}

export function AssignInspectorForm({
  jobId,
  inspectors,
  isReassign,
}: {
  jobId: number;
  inspectors: { id: number; name: string }[];
  isReassign: boolean;
}) {
  const [state, action, pending] = useActionState(assignInspector, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex flex-col gap-1.5">
        <Label>Inspector</Label>
        <Select name="inspectorId" required>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={inspectors.length === 0 ? "No active inspectors" : "Select inspector"} />
          </SelectTrigger>
          <SelectContent>
            {inspectors.map((i) => (
              <SelectItem key={i.id} value={String(i.id)}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending || inspectors.length === 0} className="btn-gold self-start">
        {pending ? "Saving…" : isReassign ? "Reassign" : "Assign Inspector"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function ApproveRejectPanel({ jobId }: { jobId: number }) {
  const [approveState, approveAction, approvePending] = useActionState(approveJob, initial);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectJob, initial);
  return (
    <div className="flex flex-col gap-4">
      <form action={approveAction}>
        <input type="hidden" name="jobId" value={jobId} />
        <Button type="submit" disabled={approvePending} className="btn-gold w-full">
          {approvePending ? "Approving…" : "Approve — Issue COQ & Invoice"}
        </Button>
        <Feedback state={approveState} />
      </form>
      <form action={rejectAction} className="flex flex-col gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <Label htmlFor={`reject-${jobId}`}>Rejection comment (required)</Label>
        <Textarea id={`reject-${jobId}`} name="comment" rows={2} placeholder="What needs to change…" required />
        <Button type="submit" variant="outline" disabled={rejectPending} className="self-start">
          {rejectPending ? "Sending back…" : "Reject / Request Amendment"}
        </Button>
        <Feedback state={rejectState} />
      </form>
    </div>
  );
}

export function PaymentActionPanel({
  jobId,
  invoiceId,
}: {
  jobId: number;
  invoiceId: number;
}) {
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyPayment, initial);
  const [rejectState, rejectAction, rejectPending] = useActionState(rejectPaymentSubmission, initial);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={verifyAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <Button type="submit" size="sm" disabled={verifyPending} className="btn-gold">
            {verifyPending ? "Verifying…" : "Verify Payment"}
          </Button>
        </form>
        <RejectPaymentInline jobId={jobId} invoiceId={invoiceId} action={rejectAction} pending={rejectPending} />
      </div>
      <Feedback state={verifyState} />
      <Feedback state={rejectState} />
    </div>
  );
}

function RejectPaymentInline({
  jobId,
  invoiceId,
  action,
  pending,
}: {
  jobId: number;
  invoiceId: number;
  action: (formData: FormData) => void;
  pending: boolean;
}) {
  return (
    <form
      action={action}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        const reason = window.prompt("Reason for rejecting this payment submission:");
        if (!reason || reason.trim().length < 3) {
          e.preventDefault();
          return;
        }
        const input = e.currentTarget.querySelector<HTMLInputElement>('input[name="reason"]');
        if (input) input.value = reason.trim();
      }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="reason" value="" />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Rejecting…" : "Reject Payment"}
      </Button>
    </form>
  );
}

export function CloseJobButton({ jobId }: { jobId: number }) {
  const [state, action, pending] = useActionState(closeJob, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" disabled={pending} className="btn-gold self-start">
        {pending ? "Closing…" : "Close Job"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function OverrideStatusForm({ jobId, current }: { jobId: number; current: string }) {
  const [state, action, pending] = useActionState(overrideJobStatus, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Set status</Label>
          <Select name="status" required defaultValue={current}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {JOB_STATUS_META[s as JobStatus].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ov-note-${jobId}`}>Reason (required)</Label>
          <Input id={`ov-note-${jobId}`} name="note" required placeholder="Why this manual change is needed…" />
        </div>
      </div>
      <Button type="submit" disabled={pending} variant="outline" className="self-start">
        {pending ? "Saving…" : "Force Status"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
