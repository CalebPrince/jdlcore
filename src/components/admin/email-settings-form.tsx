"use client";

import { useActionState } from "react";
import { saveEmailSettings, sendTestEmail, sendTestEmailToAllStaff } from "@/app/actions/email-admin";
import { testAllNotificationTypes, type TestRunState } from "@/app/actions/notification-test";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };
const initialTestRun: TestRunState = { ok: false, message: "" };

export type EmailSettingsView = {
  enabled: boolean;
  configured: boolean;
  resendKeyMasked: string | null;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassMasked: string | null;
  fromAddress: string;
  fromName: string;
};

export function EmailSettingsForm({ view }: { view: EmailSettingsView }) {
  const [state, action, pending] = useActionState(saveEmailSettings, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
        <input type="hidden" name="enabled" value={view.enabled ? "on" : ""} />
        <div>
          <p className="m-0 text-sm font-semibold text-navy-950">Notifications</p>
          <p className="m-0 text-xs text-muted-foreground">
            Email clients when their job status changes, documents are added, or invoices are issued.
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
          <Label htmlFor="e-resend">Resend API key (recommended)</Label>
          <Input
            id="e-resend"
            name="resendKey"
            type="password"
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            placeholder={view.resendKeyMasked ? `Stored (${view.resendKeyMasked}) — leave blank to keep` : "re_..."}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-host">SMTP host (alternative)</Label>
          <Input id="e-host" name="smtpHost" defaultValue={view.smtpHost} placeholder="smtp.gmail.com" autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-port">SMTP port</Label>
          <Input id="e-port" name="smtpPort" defaultValue={view.smtpPort} placeholder="587" inputMode="numeric" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-user">SMTP user</Label>
          <Input id="e-user" name="smtpUser" defaultValue={view.smtpUser} autoComplete="off" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-pass">SMTP password</Label>
          <Input
            id="e-pass"
            name="smtpPass"
            type="password"
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            placeholder={view.smtpPassMasked ? `Stored (${view.smtpPassMasked}) — leave blank to keep` : "App password"}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-from">From address</Label>
          <Input id="e-from" name="fromAddress" defaultValue={view.fromAddress} placeholder="notifications@jdlcore.com" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="e-fromname">From name</Label>
          <Input id="e-fromname" name="fromName" defaultValue={view.fromName} placeholder="JDL Core" />
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

      <Button type="submit" disabled={pending} className="btn-gold self-start">
        {pending ? "Saving..." : "Save Email Settings"}
      </Button>
    </form>
  );
}

export function TestEmailForm() {
  const [state, action, pending] = useActionState(sendTestEmail, initial);
  return (
    <form action={action} className="flex items-end gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Label htmlFor="test-to">Send a test email to</Label>
        <Input id="test-to" name="to" type="email" required placeholder="you@jdlcore.com" />
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="shrink-0">
        {pending ? "Sending…" : "Send Test"}
      </Button>
      {(state.message || state.ok) && (
        <span className={`w-full text-xs sm:w-auto ${state.ok ? "text-[#1f7a4d]" : "text-red-600"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}

export function TestAllStaffEmailForm() {
  const [state, action, pending] = useActionState(sendTestEmailToAllStaff, initial);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="outline" disabled={pending} className="shrink-0">
        {pending ? "Sending…" : "Send Test to All Staff"}
      </Button>
      {(state.message || state.ok) && (
        <span className={`text-xs ${state.ok ? "text-[#1f7a4d]" : "text-red-600"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}

export function TestAllNotificationsForm() {
  const [state, action, pending] = useActionState(testAllNotificationTypes, initialTestRun);
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
      <div>
        <p className="m-0 text-sm font-semibold text-navy-950">Notification system test</p>
        <p className="m-0 text-xs text-muted-foreground">
          Fires every client, staff, and inspector notification type (30 events) as a real email to
          your own inbox, plus one summary in your bell — proof each one actually delivers.
          Superadmin only.
        </p>
      </div>
      <form action={action}>
        <Button type="submit" variant="outline" disabled={pending} className="shrink-0">
          {pending ? "Testing all notification types…" : "Test All Notification Types"}
        </Button>
      </form>
      {(state.message || state.ok) && (
        <span className={`text-xs ${state.ok ? "text-[#1f7a4d]" : "text-red-600"}`}>
          {state.message}
        </span>
      )}
      {state.results && state.results.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr
                className="sticky top-0 border-b bg-muted/40 text-left uppercase tracking-wide text-muted-foreground"
                style={{ borderColor: "var(--border)" }}
              >
                <th className="px-3 py-1.5 font-medium">Category</th>
                <th className="px-3 py-1.5 font-medium">Notification</th>
                <th className="px-3 py-1.5 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {state.results.map((r, i) => (
                <tr key={i} className="border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
                  <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">{r.category}</td>
                  <td className="px-3 py-1.5">{r.label}</td>
                  <td className="px-3 py-1.5">
                    <Badge
                      variant="outline"
                      className={r.ok ? "border-[rgba(31,122,77,0.4)] text-[#1f7a4d]" : "border-red-300 text-red-600"}
                    >
                      {r.ok ? "sent" : "failed"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
