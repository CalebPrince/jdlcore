"use client";

import Link from "next/link";
import { useActionState } from "react";
import { inspectorLogin } from "@/app/actions/inspector";
import type { FormState } from "@/app/actions/submissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FormState = { ok: false, message: "" };

export function InspectorLoginForm() {
  const [state, action, pending] = useActionState(inspectorLogin, initial);

  return (
    <form action={action} className="auth-form-card flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" required autoFocus autoComplete="email" placeholder="you@jdlcore.com" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="password">Password</Label>
          <Link href="/account/forgot-password?type=inspector" className="text-xs font-semibold text-navy-700 hover:text-gold-700">Forgot password?</Link>
        </div>
        <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder="Your password" />
      </div>
      {!state.ok && state.message ? <Alert variant="destructive"><AlertDescription>{state.message}</AlertDescription></Alert> : null}
      <Button type="submit" disabled={pending} size="lg" className="mt-1 h-12 rounded-xl font-semibold">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <p className="m-0 text-center text-xs leading-5 text-muted-foreground">No account yet? Contact JDL Core Operations to get inspector access.</p>
    </form>
  );
}
