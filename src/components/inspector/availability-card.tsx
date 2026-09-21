"use client";

import { useActionState } from "react";
import { setMyAvailability } from "@/app/actions/inspector";
import type { FormState } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FormState = { ok: false, message: "" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" });

/** Lets an inspector say when they are away, so new jobs aren't assigned to them meanwhile. */
export function AvailabilityCard({ awayUntil, isAway }: { awayUntil: string | null; isAway: boolean }) {
  const [state, action, pending] = useActionState(setMyAvailability, initial);
  const away = awayUntil ? new Date(awayUntil) : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div>
          <h2 className="m-0 font-display text-base font-bold text-navy-950">Your availability</h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {isAway && away
              ? `You're marked away until ${dateFmt.format(away)}. You won't be given new jobs automatically before then.`
              : "You're available for new assignments. Tell us if you'll be away, so you aren't given new jobs meanwhile."}
          </p>
        </div>
        <form action={action} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="away-until">I&apos;m away until</Label>
            <Input id="away-until" name="awayUntil" type="date" className="w-44" />
          </div>
          <Button type="submit" size="sm" disabled={pending} className="btn-gold">
            {pending ? "Saving…" : "Set away"}
          </Button>
          {isAway && (
            <Button type="submit" name="back" value="1" size="sm" variant="outline" disabled={pending}>
              I&apos;m available now
            </Button>
          )}
        </form>
        {state.message && (
          <p className={`m-0 text-sm font-medium ${state.ok ? "text-[#1f7a4d]" : "text-destructive"}`} role="status">
            {state.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
