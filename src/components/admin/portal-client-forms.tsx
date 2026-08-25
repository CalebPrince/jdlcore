"use client";

import { useActionState } from "react";
import {
  createPortalClient,
  resetClientPassword,
} from "@/app/actions/portal-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function CreateClientForm() {
  const [state, action, pending] = useActionState(createPortalClient, initial);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Add Client</CardTitle>
        <CardDescription>
          Creates a portal login. Share the email and password with the client
          securely; they sign in at /portal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" name="name" required placeholder="Kwame Mensah" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-company">Company</Label>
            <Input id="c-company" name="company" placeholder="Acme Trading Ltd" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-email">Email (login)</Label>
            <Input id="c-email" name="email" type="email" required placeholder="kwame@acme.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-phone">Phone</Label>
            <Input id="c-phone" name="phone" placeholder="+233 ..." />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-password">Temporary password</Label>
            <Input id="c-password" name="password" type="text" required minLength={8} autoComplete="off" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending} className="btn-gold w-full sm:w-auto">
              {pending ? "Creating…" : "Create Client"}
            </Button>
          </div>
        </form>
        {!state.ok && state.message && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
        {state.ok && state.message && (
          <Alert className="mt-4 border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
            <AlertDescription className="text-[#1f7a4d]">{state.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function ResetPasswordForm({ clientId }: { clientId: number }) {
  const [state, action, pending] = useActionState(resetClientPassword, initial);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={clientId} />
      <Input
        name="password"
        type="text"
        required
        minLength={8}
        placeholder="New password"
        autoComplete="off"
        className="h-8 w-40 text-xs"
      />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "…" : "Reset"}
      </Button>
      {state.message && (
        <span className={`text-xs ${state.ok ? "text-[#1f7a4d]" : "text-red-600"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
