"use client";

import { useActionState } from "react";
import { staffLogin, type StaffLoginState } from "@/app/actions/staff";
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

const initial: StaffLoginState = { ok: false, message: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(staffLogin, initial);
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="font-display">JDL Core Admin</CardTitle>
        <CardDescription>
          Sign in with your staff account to manage jobs, clients, and settings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
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
