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
import { SERVICE_TYPES, SERVICE_TYPE_LABEL } from "@/lib/jobs";

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
          <fieldset className="flex flex-col gap-3 rounded-xl border p-4 sm:col-span-3" style={{ borderColor: "var(--border)" }}>
            <legend className="px-1 text-sm font-semibold text-navy-950">Automatic job assignment</legend>
            <p className="m-0 text-xs text-muted-foreground">
              Tick the services this inspector is qualified for to set them up now. They only receive auto-assigned
              jobs once they have also opened their setup link. Leave every service unticked to set this up later.
            </p>
            <div className="flex items-center gap-3">
              <input
                id="in-auto"
                name="autoAssignEnabled"
                type="checkbox"
                defaultChecked
                className="size-4 accent-[#c98e12]"
              />
              <Label htmlFor="in-auto">Include in automatic assignment</Label>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {SERVICE_TYPES.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="serviceTypes" value={key} className="size-4 accent-[#c98e12]" />
                  {SERVICE_TYPE_LABEL[key]}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="in-regions">Regions or places they cover</Label>
                <Input id="in-regions" name="regions" placeholder="Tema, Takoradi, Accra" />
                <p className="m-0 text-xs text-muted-foreground">
                  Comma separated words found in a job&apos;s location or depot. Leave empty to cover any location.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="in-max">Most open jobs at once</Label>
                <Input id="in-max" name="maxOpenJobs" type="number" min={1} max={20} defaultValue={3} />
              </div>
            </div>
          </fieldset>
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
