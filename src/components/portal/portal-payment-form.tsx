"use client";

import { useActionState } from "react";
import { markPaymentSubmitted } from "@/app/actions/portal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function PortalPaymentForm({
  invoiceId,
  jobId,
  bare = false,
}: {
  invoiceId: number;
  jobId: number;
  /** True when a Paystack button already renders above this — drops the redundant border/margin and relabels as the fallback option. */
  bare?: boolean;
}) {
  const [state, action, pending] = useActionState(markPaymentSubmitted, initial);
  return (
    <form
      action={action}
      className={bare ? "flex w-full flex-col gap-3" : "mt-3 flex w-full flex-col gap-3 border-t pt-3"}
      style={bare ? undefined : { borderColor: "var(--border)" }}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="jobId" value={jobId} />
      {bare && (
        <p className="m-0 text-xs text-muted-foreground">
          Already paid by bank transfer? Submit your receipt instead:
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`receipt-${invoiceId}`}>Payment receipt (PDF or photo, max 4 MB)</Label>
          <Input
            id={`receipt-${invoiceId}`}
            name="receiptFile"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            capture="environment"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ref-${invoiceId}`}>Payment reference (optional)</Label>
          <Input id={`ref-${invoiceId}`} name="paymentReference" placeholder="Transaction ID, cheque no…" />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor={`comment-${invoiceId}`}>Comment (optional)</Label>
          <Input id={`comment-${invoiceId}`} name="clientComment" placeholder="Paid via bank transfer on…" />
        </div>
      </div>
      <Button type="submit" disabled={pending} variant="outline" className="self-start">
        {pending ? "Submitting…" : "Submit Payment Receipt"}
      </Button>
      {state.message && (
        <Alert
          variant={state.ok ? undefined : "destructive"}
          className={state.ok ? "border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]" : undefined}
        >
          <AlertDescription className={state.ok ? "text-[#1f7a4d]" : undefined}>
            {state.message}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}
