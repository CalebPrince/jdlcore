"use client";

import { useActionState } from "react";
import { completeInspectorSetup } from "@/app/actions/inspector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function InspectorSetupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(completeInspectorSetup, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="is-pass">Choose a password</Label>
        <Input
          id="is-pass"
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
        {pending ? "Activating…" : "Activate Account"}
      </Button>
    </form>
  );
}
