"use client";

import { useActionState } from "react";
import { completeStaffSetup, type StaffLoginState } from "@/app/actions/staff";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: StaffLoginState = { ok: false, message: "" };

export function StaffSetupForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(completeStaffSetup, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ss-pass">Choose a password</Label>
        <Input
          id="ss-pass"
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
