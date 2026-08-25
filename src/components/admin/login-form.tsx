"use client";

import { useActionState } from "react";
import { login, type AdminState } from "@/app/actions/admin";
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

const initial: AdminState = { ok: false, message: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-display">JDL Core Admin</CardTitle>
        <CardDescription>
          Enter the admin password to manage site settings and submissions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              autoComplete="current-password"
            />
          </div>
          {state.message && !state.ok && (
            <p className="text-sm font-medium text-destructive">{state.message}</p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Checking…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
