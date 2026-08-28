"use client";

import { useActionState } from "react";
import { CreditCard } from "lucide-react";
import { requestSubscriptionManageLink } from "@/app/actions/analytics";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function ManageBillingButton() {
  const [state, action, pending] = useActionState(requestSubscriptionManageLink, initial);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <Button type="submit" variant="outline" disabled={pending} className="h-11 w-full justify-start rounded-xl">
        <CreditCard aria-hidden="true" /> {pending ? "Sending…" : "Manage Billing"}
      </Button>
      {state.message && (
        <p className={`px-1 text-xs ${state.ok ? "text-[#1f7a4d]" : "text-red-600"}`}>{state.message}</p>
      )}
    </form>
  );
}
