"use client";

import { useActionState } from "react";
import { updateService } from "@/app/actions/services-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function ServiceRowForm({
  id,
  label,
  pricingLabel,
  defaultPriceCents,
  active,
}: {
  id: number;
  label: string;
  pricingLabel: string | null;
  defaultPriceCents: number | null;
  active: boolean;
}) {
  const [state, action, pending] = useActionState(updateService, initial);
  const [toggleState, toggleAction, togglePending] = useActionState(updateService, initial);
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="active" value={active ? "true" : "false"} />
        <div className="min-w-[200px] flex-1">
          <p className="m-0 text-sm font-semibold text-navy-950">{label}</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Pricing label (shown to clients)</label>
          <Input
            name="pricingLabel"
            defaultValue={pricingLabel ?? ""}
            placeholder="From GHS 1,200"
            className="w-56"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Default price (GHS, for auto-invoice)</label>
          <Input
            name="defaultPriceCents"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaultPriceCents != null ? (defaultPriceCents / 100).toFixed(2) : ""}
            placeholder="Manual"
            className="w-32"
          />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
      <form action={toggleAction} className="mt-2">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="pricingLabel" value={pricingLabel ?? ""} />
        <input type="hidden" name="defaultPriceCents" value={defaultPriceCents != null ? (defaultPriceCents / 100).toFixed(2) : ""} />
        <input type="hidden" name="active" value={active ? "false" : "true"} />
        <Button type="submit" variant="ghost" size="sm" disabled={togglePending}>
          {togglePending ? "Saving…" : active ? "Deactivate" : "Activate"}
        </Button>
      </form>
      {toggleState.message && !toggleState.ok && (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>{toggleState.message}</AlertDescription>
        </Alert>
      )}
      {state.message && (
        <Alert
          variant={state.ok ? undefined : "destructive"}
          className={state.ok ? "mt-2 border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]" : "mt-2"}
        >
          <AlertDescription className={state.ok ? "text-[#1f7a4d]" : undefined}>{state.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
