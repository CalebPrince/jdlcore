"use client";

import Link from "next/link";
import { useActionState } from "react";
import { portalLogin, type PortalFormState } from "@/app/actions/portal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: PortalFormState = { ok: false, message: "" };

export function PortalLoginForm() {
  const [state, action, pending] = useActionState(portalLogin, initial);

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-deep px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-inspection.png" alt="JDL Core logo" className="h-14" />
        </Link>
        <form action={action} className="flex flex-col gap-5 rounded-[var(--radius)] border bg-white p-7 shadow-[var(--shadow-sm-soft)]" style={{ borderColor: "var(--border)" }}>
          <div>
            <h1 className="font-display text-[1.4rem] font-bold text-navy-950">
              Client Portal
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to track your inspections, download reports and manage
              invoices.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>

          {!state.ok && state.message && (
            <Alert variant="destructive">
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={pending} className="btn-gold w-full">
            {pending ? "Signing in…" : "Sign In"}
          </Button>
          <p className="m-0 text-center text-xs"><Link href="/account/forgot-password?type=portal" className="font-semibold text-gold-700">Forgot password?</Link></p>

          <p className="m-0 text-center text-xs text-muted-foreground">
            No account yet? Contact your JDL Core representative to get portal
            access.
          </p>
        </form>
        <p className="mt-6 text-center text-xs text-ink-faint">
          <Link href="/inspection" className="hover:text-gold-600">
            ← Back to Inspection Services
          </Link>
        </p>
      </div>
    </div>
  );
}
