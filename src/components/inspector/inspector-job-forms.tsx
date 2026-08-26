"use client";

import { useActionState } from "react";
import {
  acceptAssignment,
  addStockReading,
  amendAndResubmit,
  declineAssignment,
  postProgressUpdate,
  saveCompletionData,
  submitForApproval,
} from "@/app/actions/inspector";
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

export function AcceptDeclineForms({ jobId }: { jobId: number }) {
  const [acceptState, acceptAction, acceptPending] = useActionState(acceptAssignment, initial);
  const [declineState, declineAction, declinePending] = useActionState(declineAssignment, initial);
  return (
    <div className="flex flex-col gap-4">
      <form action={acceptAction}>
        <input type="hidden" name="jobId" value={jobId} />
        <Button type="submit" disabled={acceptPending} className="btn-gold w-full">
          {acceptPending ? "Accepting…" : "Accept Request"}
        </Button>
        <Feedback state={acceptState} />
      </form>
      <form
        action={declineAction}
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          const reason = window.prompt("Why are you declining this assignment?");
          if (!reason || reason.trim().length < 3) {
            e.preventDefault();
            return;
          }
          const input = e.currentTarget.querySelector<HTMLInputElement>('input[name="reason"]');
          if (input) input.value = reason.trim();
        }}
      >
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="reason" value="" />
        <Button type="submit" variant="outline" disabled={declinePending} className="self-start">
          {declinePending ? "Declining…" : "Decline / Request Clarification"}
        </Button>
        <Feedback state={declineState} />
      </form>
    </div>
  );
}

export function ProgressUpdateForm({ jobId }: { jobId: number }) {
  const [state, action, pending] = useActionState(postProgressUpdate, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`pu-${jobId}`}>Post an update</Label>
        <Input id={`pu-${jobId}`} name="note" required placeholder="Arrived at location, tank gauging commenced…" />
      </div>
      <Button type="submit" disabled={pending} variant="outline" className="self-start">
        {pending ? "Posting…" : "Post Update"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function CompletionDataForm({
  jobId,
  defaultValues,
}: {
  jobId: number;
  defaultValues?: {
    dateTimeStarted?: string | null;
    dateTimeCompleted?: string | null;
    service?: string | null;
    gov?: string | null;
    gsv?: string | null;
    metricTonnesAir?: string | null;
    metricTonnesVacuum?: string | null;
    inspectorComments?: string | null;
  };
}) {
  const [state, action, pending] = useActionState(saveCompletionData, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cd-start-${jobId}`}>Date/Time Started</Label>
          <Input
            id={`cd-start-${jobId}`}
            name="dateTimeStarted"
            type="datetime-local"
            defaultValue={defaultValues?.dateTimeStarted ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cd-end-${jobId}`}>Date/Time Completed</Label>
          <Input
            id={`cd-end-${jobId}`}
            name="dateTimeCompleted"
            type="datetime-local"
            defaultValue={defaultValues?.dateTimeCompleted ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cd-gov-${jobId}`}>Gross Observed Volume (GOV)</Label>
          <Input
            id={`cd-gov-${jobId}`}
            name="gov"
            inputMode="decimal"
            placeholder="0.000"
            defaultValue={defaultValues?.gov ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cd-gsv-${jobId}`}>Gross Standard Volume (GSV)</Label>
          <Input
            id={`cd-gsv-${jobId}`}
            name="gsv"
            inputMode="decimal"
            placeholder="0.000"
            defaultValue={defaultValues?.gsv ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cd-mta-${jobId}`}>Metric Tonnes in Air</Label>
          <Input
            id={`cd-mta-${jobId}`}
            name="metricTonnesAir"
            inputMode="decimal"
            placeholder="0.000"
            defaultValue={defaultValues?.metricTonnesAir ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`cd-mtv-${jobId}`}>Metric Tonnes in Vacuum</Label>
          <Input
            id={`cd-mtv-${jobId}`}
            name="metricTonnesVacuum"
            inputMode="decimal"
            placeholder="0.000"
            defaultValue={defaultValues?.metricTonnesVacuum ?? undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`cd-comments-${jobId}`}>Inspector Comments</Label>
          <Textarea
            id={`cd-comments-${jobId}`}
            name="inspectorComments"
            rows={3}
            defaultValue={defaultValues?.inspectorComments ?? undefined}
          />
        </div>
      </div>
      <Button type="submit" disabled={pending} variant="outline" className="self-start">
        {pending ? "Saving…" : "Save Completion Data"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function StockReadingForm({ jobId, tanks }: { jobId: number; tanks: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState(addStockReading, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Tank</Label>
          <Select name="tankId" required>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={tanks.length === 0 ? "No tanks on file" : "Select tank"} />
            </SelectTrigger>
            <SelectContent>
              {tanks.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`sr-date-${jobId}`}>Reading date</Label>
          <Input id={`sr-date-${jobId}`} name="readingDate" type="date" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`sr-open-${jobId}`}>Opening stock</Label>
          <Input id={`sr-open-${jobId}`} name="openingStock" inputMode="decimal" placeholder="0.000" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`sr-recv-${jobId}`}>Receipts</Label>
          <Input id={`sr-recv-${jobId}`} name="receipts" inputMode="decimal" placeholder="0.000" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`sr-tran-${jobId}`}>Transfers</Label>
          <Input id={`sr-tran-${jobId}`} name="transfers" inputMode="decimal" placeholder="0.000" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`sr-disc-${jobId}`}>Discharges/Loads</Label>
          <Input id={`sr-disc-${jobId}`} name="dischargesLoads" inputMode="decimal" placeholder="0.000" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`sr-close-${jobId}`}>Closing stock</Label>
          <Input id={`sr-close-${jobId}`} name="closingStock" inputMode="decimal" placeholder="0.000" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`sr-gsv-${jobId}`}>GSV</Label>
          <Input id={`sr-gsv-${jobId}`} name="gsv" inputMode="decimal" placeholder="0.000" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`sr-notes-${jobId}`}>Notes</Label>
          <Textarea id={`sr-notes-${jobId}`} name="notes" rows={2} />
        </div>
      </div>
      <Button type="submit" disabled={pending || tanks.length === 0} variant="outline" className="self-start">
        {pending ? "Logging…" : "Log Stock Reading"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function SubmitForApprovalForm({ jobId }: { jobId: number }) {
  const [state, action, pending] = useActionState(submitForApproval, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Are you sure you want to submit this completed service to Operations for approval?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" disabled={pending} className="btn-gold w-full">
        {pending ? "Submitting…" : "Submit for Approval"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function AmendResubmitForm({ jobId }: { jobId: number }) {
  const [state, action, pending] = useActionState(amendAndResubmit, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm("Resubmit this job to Operations for approval?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" disabled={pending} className="btn-gold w-full">
        {pending ? "Resubmitting…" : "Resubmit for Approval"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
