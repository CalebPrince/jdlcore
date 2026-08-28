"use client";

import { useActionState } from "react";
import { changeMyPassword, updateMyAccount } from "@/app/actions/staff-account";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function MyProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action, pending] = useActionState(updateMyAccount, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="my-name">Name</Label>
          <Input id="my-name" name="name" defaultValue={name} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="my-email">Email</Label>
          <Input id="my-email" name="email" type="email" defaultValue={email} required />
        </div>
      </div>
      {!state.ok && state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.ok && state.message && (
        <Alert className="border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
          <AlertDescription className="text-[#1f7a4d]">{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="btn-gold w-fit">
        {pending ? "Saving…" : "Save Changes"}
      </Button>
    </form>
  );
}

export function MyPasswordForm() {
  const [state, action, pending] = useActionState(changeMyPassword, initial);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input id="current-password" name="currentPassword" type="password" required autoComplete="current-password" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password">Confirm new password</Label>
          <Input id="confirm-password" name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" />
        </div>
      </div>
      {!state.ok && state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.ok && state.message && (
        <Alert className="border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
          <AlertDescription className="text-[#1f7a4d]">{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="btn-gold w-fit">
        {pending ? "Updating…" : "Change Password"}
      </Button>
    </form>
  );
}
