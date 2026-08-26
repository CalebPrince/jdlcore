"use client";

import { useActionState, useState } from "react";
import { inviteInspector } from "@/app/actions/inspector-authadmin";
import type { InviteState } from "@/app/actions/inspector-authadmin";
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

const initial: InviteState = { ok: false, message: "" };

export function InviteInspectorForm() {
  const [state, action, pending] = useActionState(inviteInspector, initial);
  const [copied, setCopied] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">Invite Inspector</CardTitle>
        <CardDescription>
          Creates or re-invites an inspector account. They&apos;ll set their own password via a one-time link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="in-name">Name</Label>
            <Input id="in-name" name="name" required placeholder="Kojo Asante" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="in-email">Email</Label>
            <Input id="in-email" name="email" type="email" required placeholder="kojo@jdlcore.com" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="in-phone">Phone (optional)</Label>
            <Input id="in-phone" name="phone" placeholder="+233 24 000 0000" />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={pending} className="btn-gold">
              {pending ? "Sending…" : "Invite Inspector"}
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
