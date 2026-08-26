"use client";

import { useActionState } from "react";
import {
  addDocument,
  createInvoice,
  sendInvoiceReminder,
} from "@/app/actions/portal-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      className={
        state.ok ? "border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]" : undefined
      }
    >
      <AlertDescription className={state.ok ? "text-[#1f7a4d]" : undefined}>
        {state.message}
      </AlertDescription>
    </Alert>
  );
}

export function AddDocumentForm({ jobId }: { jobId: number }) {
  const [state, action, pending] = useActionState(addDocument, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`dk-${jobId}`}>Type</Label>
          <Select name="kind" required defaultValue="report">
            <SelectTrigger id={`dk-${jobId}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="report">Inspection Report</SelectItem>
              <SelectItem value="coq">Certificate of Quantity</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`dt-${jobId}`}>Title</Label>
          <Input id={`dt-${jobId}`} name="title" required placeholder="Final Report — Tank Farm B" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`df-${jobId}`}>Upload file (max 4 MB)</Label>
          <Input id={`df-${jobId}`} name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`du-${jobId}`}>…or paste a link</Label>
          <Input id={`du-${jobId}`} name="url" type="url" placeholder="https://…" />
        </div>
      </div>
      <Button type="submit" disabled={pending} variant="outline" className="self-start">
        {pending ? "Adding…" : "Attach Document"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function CreateInvoiceForm({
  jobId,
  defaultCurrency = "GHS",
  defaultDueDate,
}: {
  jobId: number;
  defaultCurrency?: string;
  defaultDueDate?: string;
}) {
  const [state, action, pending] = useActionState(createInvoice, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ia-${jobId}`}>Amount</Label>
          <Input id={`ia-${jobId}`} name="amount" type="number" step="0.01" min="0.01" required placeholder="12500.00" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Currency</Label>
          <Select name="currency" defaultValue={defaultCurrency}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GHS">GHS</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`id-${jobId}`}>Due date (optional)</Label>
          <Input id={`id-${jobId}`} name="dueDate" type="date" defaultValue={defaultDueDate} />
        </div>
      </div>
      <Button type="submit" disabled={pending} variant="outline" className="self-start">
        {pending ? "Issuing…" : "Issue Invoice"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function InvoiceReminderButton({ invoiceId, jobId }: { invoiceId: number; jobId: number }) {
  const [state, action, pending] = useActionState(sendInvoiceReminder, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "Sending…" : "Send reminder"}
      </Button>
      {state.message && (
        <span className={`text-xs ${state.ok ? "text-[#1f7a4d]" : "text-destructive"}`} role="status">
          {state.ok ? "Sent" : "Not sent"}
        </span>
      )}
    </form>
  );
}
