"use client";

import { useActionState } from "react";
import { savePaystackSettings, syncAnalyticsPlanCodes, testPaystackConnection } from "@/app/actions/paystack-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export type PaystackSettingsView = {
  enabled: boolean;
  configured: boolean;
  secretKeyMasked: string | null;
  publicKey: string;
  mode: "live" | "test" | null;
};

export function PaystackSettingsForm({ view }: { view: PaystackSettingsView }) {
  const [state, action, pending] = useActionState(savePaystackSettings, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
        <input type="hidden" name="enabled" value={view.enabled ? "on" : ""} />
        <div>
          <p className="m-0 text-sm font-semibold text-navy-950">Online payments</p>
          <p className="m-0 text-xs text-muted-foreground">
            Let clients pay an invoice by card or mobile money instead of uploading a bank transfer receipt.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Switch
            defaultChecked={view.enabled}
            onCheckedChange={(checked) => {
              const hidden = document.querySelector<HTMLInputElement>('input[name="enabled"]');
              if (hidden) hidden.value = checked ? "on" : "";
            }}
          />
          Enabled
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="p-secret">Secret key</Label>
          <Input
            id="p-secret"
            name="secretKey"
            type="password"
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            placeholder={view.secretKeyMasked ? `Stored (${view.secretKeyMasked}) — leave blank to keep` : "sk_test_... or sk_live_..."}
          />
          <p className="m-0 text-xs text-muted-foreground">
            From your Paystack dashboard → Settings → API Keys &amp; Webhooks. Never shared with the browser.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="p-public">Public key</Label>
          <Input
            id="p-public"
            name="publicKey"
            defaultValue={view.publicKey}
            autoComplete="off"
            placeholder="pk_test_... or pk_live_..."
          />
        </div>
      </div>

      {view.mode && (
        <Alert className={view.mode === "live" ? "border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]" : "border-gold-500/40 bg-gold-500/10"}>
          <AlertDescription className={view.mode === "live" ? "text-[#1f7a4d]" : "text-gold-700"}>
            {view.mode === "live"
              ? "Live mode — real charges will be made."
              : "Test mode — no real money moves. Switch to a live secret key before going to production."}
          </AlertDescription>
        </Alert>
      )}

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
        {pending ? "Saving..." : "Save Payment Settings"}
      </Button>
    </form>
  );
}

export function TestPaystackConnectionForm() {
  const [state, action, pending] = useActionState(testPaystackConnection, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="outline" disabled={pending} className="shrink-0">
        {pending ? "Testing…" : "Test Connection"}
      </Button>
      {(state.message || state.ok) && (
        <span className={`text-xs ${state.ok ? "text-[#1f7a4d]" : "text-red-600"}`}>{state.message}</span>
      )}
    </form>
  );
}

export function SyncAnalyticsPlansForm() {
  const [state, action, pending] = useActionState(syncAnalyticsPlanCodes, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" variant="outline" disabled={pending} className="shrink-0 self-start">
        {pending ? "Syncing…" : "Sync Analytics Plans to Paystack"}
      </Button>
      {(state.message || state.ok) && (
        <span className={`text-xs ${state.ok ? "text-[#1f7a4d]" : "text-red-600"}`}>{state.message}</span>
      )}
    </form>
  );
}
