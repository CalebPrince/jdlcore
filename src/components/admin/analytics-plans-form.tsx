"use client";

import { useActionState } from "react";
import { saveAnalyticsPricing } from "@/app/actions/analytics-plans-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FormState } from "@/app/actions/submissions";
import type { AnalyticsPlanContent, AnalyticsPlanId } from "@/lib/analytics-plans";

const initial: FormState = { ok: false, message: "" };

const TIERS: { id: AnalyticsPlanId; billable: boolean }[] = [
  { id: "depot", billable: true },
  { id: "trader", billable: true },
  { id: "enterprise", billable: false },
];

export function AnalyticsPlansForm({ plans }: { plans: Record<AnalyticsPlanId, AnalyticsPlanContent> }) {
  const [state, action, pending] = useActionState(saveAnalyticsPricing, initial);

  return (
    <form action={action} className="flex flex-col gap-6">
      {TIERS.map(({ id, billable }) => {
        const plan = plans[id];
        return (
          <div key={id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
            <p className="m-0 mb-3 font-display text-sm font-bold uppercase tracking-[0.06em] text-navy-800">
              {plan.label} tier
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}_label`}>Name</Label>
                <Input id={`${id}_label`} name={`${id}_label`} defaultValue={plan.label} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}_price`}>Price (GHS / month{billable ? "" : ", blank = Custom"})</Label>
                <Input
                  id={`${id}_price`}
                  name={`${id}_price`}
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={plan.priceCents !== null ? plan.priceCents / 100 : ""}
                  placeholder={billable ? "" : "Custom"}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${id}_tagline`}>Tagline</Label>
                <Input id={`${id}_tagline`} name={`${id}_tagline`} defaultValue={plan.tagline} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}_monthlyLimit`}>Monthly questions (blank = unlimited)</Label>
                <Input
                  id={`${id}_monthlyLimit`}
                  name={`${id}_monthlyLimit`}
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={plan.monthlyQuestionLimit ?? ""}
                  placeholder="Unlimited"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}_seatLimit`}>Seats (blank = unlimited)</Label>
                <Input
                  id={`${id}_seatLimit`}
                  name={`${id}_seatLimit`}
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={plan.seatLimit ?? ""}
                  placeholder="Unlimited"
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor={`${id}_features`}>Feature bullets (one per line)</Label>
                <Textarea
                  id={`${id}_features`}
                  name={`${id}_features`}
                  defaultValue={plan.features.join("\n")}
                  rows={4}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}_ctaLabel`}>Button label</Label>
                <Input id={`${id}_ctaLabel`} name={`${id}_ctaLabel`} defaultValue={plan.ctaLabel} />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-muted-foreground">
                <input type="checkbox" name={`${id}_highlight`} defaultChecked={plan.highlight} className="size-4" />
                Highlight as &ldquo;Most Popular&rdquo;
              </label>
            </div>
          </div>
        );
      })}

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

      <Button type="submit" disabled={pending} className="btn-gold self-start">
        {pending ? "Saving..." : "Save Pricing"}
      </Button>
      <p className="m-0 -mt-4 text-xs text-muted-foreground">
        Changing Depot or Trader&apos;s price only affects new subscribers — existing subscribers keep the rate
        they signed up at.
      </p>
    </form>
  );
}
