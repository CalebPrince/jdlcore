"use client";

import { useActionState } from "react";
import { startAnalyticsSubscription } from "@/app/actions/analytics-subscribe";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function AnalyticsSubscribeForm({ plan, priceLabel }: { plan: "depot" | "trader"; priceLabel: string }) {
  const [state, action, pending] = useActionState(startAnalyticsSubscription, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="plan" value={plan} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sub-name">Your name</Label>
        <Input id="sub-name" name="name" required minLength={2} placeholder="Kwame Mensah" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sub-email">Email</Label>
        <Input id="sub-email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-company">Company (optional)</Label>
          <Input id="sub-company" name="company" autoComplete="organization" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-phone">Phone (optional)</Label>
          <Input id="sub-phone" name="phone" autoComplete="tel" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sub-pass">Choose a password</Label>
        <Input
          id="sub-pass"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
        />
      </div>
      {!state.ok && state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} size="lg" className="btn-gold mt-1 h-12 rounded-xl font-semibold">
        {pending ? "Redirecting to Paystack…" : `Continue to Payment — ${priceLabel}`}
      </Button>
      <p className="m-0 text-center text-xs text-muted-foreground">
        You&apos;ll pay securely on Paystack, then land straight in your workspace.
      </p>
    </form>
  );
}
