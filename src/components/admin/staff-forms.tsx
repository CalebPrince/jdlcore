"use client";

import { useActionState, useState } from "react";
import { createAccount } from "@/app/actions/staff-admin";
import type { InviteState } from "@/app/actions/staff-admin";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initial: InviteState = { ok: false, message: "" };

const ROLE_META: Record<string, { button: string; description: string }> = {
  operations: {
    button: "Invite Staff",
    description: "Creates or re-invites a staff account. They'll set their own password via a one-time link.",
  },
  administrator: {
    button: "Invite Staff",
    description: "Creates or re-invites a staff account. They'll set their own password via a one-time link.",
  },
  superadmin: {
    button: "Invite Staff",
    description: "Creates or re-invites a staff account. They'll set their own password via a one-time link.",
  },
  inspector: {
    button: "Invite Inspector",
    description: "Creates or re-invites an inspector account. They'll set their own password via a one-time link.",
  },
  client: {
    button: "Create Client",
    description: "Creates a client portal login directly. Share the email and password with the client securely; they sign in at /portal.",
  },
};

export function InviteStaffForm() {
  const [state, action, pending] = useActionState(createAccount, initial);
  const [copied, setCopied] = useState(false);
  const [role, setRole] = useState("operations");
  const isClient = role === "client";
  const isInspector = role === "inspector";
  const meta = ROLE_META[role] ?? ROLE_META.operations;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Create Account</CardTitle>
        <CardDescription>{meta.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-name">Name</Label>
            <Input id="st-name" name="name" required placeholder="Ama Boateng" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-email">Email</Label>
            <Input id="st-email" name="email" type="email" required placeholder="ama@jdlcore.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="st-role">Role</Label>
            <Select name="role" required value={role} onValueChange={setRole}>
              <SelectTrigger id="st-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="operations">Operations</SelectItem>
                <SelectItem value="administrator">Administrator</SelectItem>
                <SelectItem value="superadmin">Super Admin</SelectItem>
                <SelectItem value="inspector">Inspector</SelectItem>
                <SelectItem value="client">Client</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isInspector && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="st-phone">Phone (optional)</Label>
              <Input id="st-phone" name="phone" placeholder="+233 24 000 0000" />
            </div>
          )}
          {isClient && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-company">Company</Label>
                <Input id="st-company" name="company" placeholder="Acme Trading Ltd" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-phone">Phone</Label>
                <Input id="st-phone" name="phone" placeholder="+233 ..." />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="st-password">Temporary password</Label>
                <Input id="st-password" name="password" type="text" required minLength={8} autoComplete="off" />
              </div>
            </>
          )}
          <div className="sm:col-span-3">
            <Button type="submit" disabled={pending} className="btn-gold">
              {pending ? "Saving…" : meta.button}
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
            <AlertDescription className="text-[#1f7a4d]">
              {state.message}
              {state.setupLink && !state.emailed && (
                <span className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="rounded bg-white px-2 py-1 text-xs">{state.setupLink}</code>
                  <button
                    type="button"
                    className="text-xs font-semibold underline"
                    onClick={() => {
                      navigator.clipboard.writeText(state.setupLink!);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                </span>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
