"use client";

import { useActionState } from "react";
import { CreditCard } from "lucide-react";
import { payInvoiceOnline } from "@/app/actions/portal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function PortalPaystackButton({ invoiceId, jobId }: { invoiceId: number; jobId: number }) {
  const [state, action, pending] = useActionState(payInvoiceOnline, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="jobId" value={jobId} />
      <Button type="submit" disabled={pending} className="btn-gold self-start">
        <CreditCard className="mr-1.5 h-3.5 w-3.5" />
        {pending ? "Redirecting to Paystack…" : "Pay Online with Paystack"}
      </Button>
      {!state.ok && state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
