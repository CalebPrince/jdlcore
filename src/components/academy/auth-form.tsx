"use client";

import Link from "next/link";
import { useActionState } from "react";
import { academyLogin, academyRegister } from "@/app/actions/academy";
import type { FormState } from "@/app/actions/submissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FormState = { ok: false, message: "" };

export function AcademyAuthForm({ mode }: { mode: "login" | "register" }) {
  const [state, action, pending] = useActionState(
    mode === "login" ? academyLogin : academyRegister,
    initial,
  );

  return (
    <form action={action} className="space-y-5">
      {mode === "register" ? (
        <>
          <Field label="Full name" name="name" autoComplete="name" required placeholder="Kwame Mensah" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company" name="company" autoComplete="organization" placeholder="Optional" />
            <Field label="Job role" name="role" placeholder="Inspector trainee" />
          </div>
        </>
      ) : null}

      <Field label="Email address" name="email" type="email" autoComplete="email" required autoFocus placeholder="you@company.com" />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
        minLength={mode === "register" ? 8 : undefined}
        placeholder={mode === "register" ? "At least 8 characters" : "Your password"}
        accessory={mode === "login" ? <Link href="/account/forgot-password?type=academy" className="text-xs font-semibold text-navy-700 hover:text-gold-700">Forgot password?</Link> : undefined}
      />

      {state.message ? (
        <Alert variant={state.ok ? "default" : "destructive"}><AlertDescription>{state.message}</AlertDescription></Alert>
      ) : null}

      <Button type="submit" disabled={pending} size="lg" className="h-12 w-full rounded-xl font-semibold">
        {pending ? "Please wait…" : mode === "login" ? "Sign in to Academy" : "Create learner account"}
      </Button>
      <p className="text-center text-sm text-ink-faint">
        {mode === "login" ? "New to JDL Academy?" : "Already have an account?"}{" "}
        <Link className="font-semibold text-navy-800 hover:text-gold-700" href={mode === "login" ? "/academy/register" : "/academy/login"}>
          {mode === "login" ? "Create account" : "Sign in"}
        </Link>
      </p>
    </form>
  );
}

function Field({ label, accessory, ...props }: React.ComponentProps<typeof Input> & { label: string; accessory?: React.ReactNode }) {
  const id = props.id ?? props.name;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id}>{label}</Label>
        {accessory}
      </div>
      <Input id={id} {...props} />
    </div>
  );
}
