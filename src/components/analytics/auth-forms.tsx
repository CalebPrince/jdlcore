"use client";

import Link from "next/link";
import { useActionState } from "react";
import { analyticsLogin, completeSetup } from "@/app/actions/analytics";
import type { FormState } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

const initial: FormState = { ok: false, message: "" };

export function AnalyticsLoginForm() {
  const [state, action, pending] = useActionState(analyticsLogin, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="al-email">Email</Label>
        <Input id="al-email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="al-pass">Password</Label>
        <Input id="al-pass" name="password" type="password" required autoComplete="current-password" />
      </div>
      {!state.ok && state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="btn-gold">
        {pending ? "Signing in…" : "Sign In"}
      </Button>
      <p className="text-center text-xs"><Link href="/account/forgot-password?type=analytics" className="font-semibold text-gold-700">Forgot password?</Link></p>
    </form>
  );
}

export function AnalyticsSetupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(completeSetup, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="as-name">Your name</Label>
        <Input id="as-name" name="name" required minLength={2} placeholder="Kwame Mensah" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="as-pass">Choose a password</Label>
        <Input
          id="as-pass"
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
      <Button type="submit" disabled={pending} className="btn-gold">
        {pending ? "Activating…" : "Activate Access"}
      </Button>
    </form>
  );
}
