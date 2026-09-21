"use client";

import { useActionState } from "react";
import { updateAutomationSettings, type AdminState } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SERVICE_TYPES, SERVICE_TYPE_LABEL } from "@/lib/jobs";
import type { AutomationSettings } from "@/lib/settings";

const initial: AdminState = { ok: false, message: "" };

export type ApprovalStatsView = {
  decided: number;
  agreedPass: number;
  passButRejected: number;
  failButApproved: number;
};

export function AutomationSettingsForm({
  defaults,
  stats,
}: {
  defaults: AutomationSettings;
  stats: ApprovalStatsView | null;
}) {
  const [state, action, pending] = useActionState(updateAutomationSettings, initial);
  const allowed = new Set(defaults.approvalServiceTypes.split(",").filter(Boolean));

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="font-display">Assignment &amp; Approval Automation</CardTitle>
        <CardDescription>
          Both are off until you switch them on. Bank-transfer payment verification is never automated.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-3 sm:col-span-2">
            <h3 className="m-0 text-sm font-semibold text-navy-950">Inspector assignment</h3>
            <div className="flex items-start gap-3">
              <input
                id="autoAssign"
                name="autoAssign"
                type="checkbox"
                defaultChecked={defaults.autoAssign === "1"}
                className="mt-1 size-4 accent-[#c98e12]"
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor="autoAssign">Assign new jobs to a matching inspector automatically</Label>
                <p className="text-xs text-muted-foreground">
                  Only inspectors you have switched on (Admin &gt; Inspectors &gt; Assignment profile) are considered.
                  The choice and the reason are written to the job timeline. Inspectors can still decline.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:max-w-xs">
              <Label htmlFor="reassignHours">Move to the next inspector if not accepted within (hours)</Label>
              <Input id="reassignHours" name="reassignHours" type="number" min={1} max={168} defaultValue={defaults.reassignHours} required />
              <p className="text-xs text-muted-foreground">
                Checked once a day, so it can take a little longer than this.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t pt-5 sm:col-span-2" style={{ borderColor: "var(--border)" }}>
            <h3 className="m-0 text-sm font-semibold text-navy-950">Job approval</h3>
            <div className="flex flex-col gap-2 sm:max-w-sm">
              <Label htmlFor="approvalMode">Mode</Label>
              <Select name="approvalMode" defaultValue={defaults.approvalMode}>
                <SelectTrigger id="approvalMode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Off: your team approves everything</SelectItem>
                  <SelectItem value="shadow">Shadow: run the checks, your team still approves</SelectItem>
                  <SelectItem value="auto">Automatic: approve jobs that pass every check</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Start with Shadow. It records what the checks would have decided so you can compare with your team before
                trusting it. Approving issues the Certificate of Quantity, so Automatic only ever approves, never rejects;
                anything doubtful stays for a person.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="approvalHoldHours">Wait before approving (hours)</Label>
                <Input id="approvalHoldHours" name="approvalHoldHours" type="number" min={0} max={168} defaultValue={defaults.approvalHoldHours} required />
                <p className="text-xs text-muted-foreground">Gives your team time to look first. Approval is checked once a day, so it can take a little longer than this.</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="approvalMinCleanJobs">Inspector needs this many clean jobs in a row</Label>
                <Input id="approvalMinCleanJobs" name="approvalMinCleanJobs" type="number" min={1} max={50} defaultValue={defaults.approvalMinCleanJobs} required />
                <p className="text-xs text-muted-foreground">Approved without ever being sent back for changes.</p>
              </div>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Services that may be approved automatically</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {SERVICE_TYPES.map((key) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="approvalServiceTypes"
                      value={key}
                      defaultChecked={allowed.has(key)}
                      className="size-4 accent-[#c98e12]"
                    />
                    {SERVICE_TYPE_LABEL[key]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                A job is only approved automatically when every check passes: figures complete and consistent, AI review
                ran and raised nothing, a report attached, first submission, and the inspector&apos;s clean record.
              </p>
            </fieldset>

            {stats && (
              <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "var(--border)" }}>
                <p className="m-0 font-semibold text-navy-950">Shadow results, last 60 days</p>
                {stats.decided === 0 ? (
                  <p className="m-0 mt-1 text-muted-foreground">
                    No decisions recorded yet. Once your team approves or returns jobs in Shadow mode, the comparison shows here.
                  </p>
                ) : (
                  <ul className="m-0 mt-1 list-disc pl-5 text-muted-foreground">
                    <li>{stats.decided} job{stats.decided === 1 ? "" : "s"} decided by your team.</li>
                    <li>{stats.agreedPass} passed the checks and your team approved them (automation would have been right).</li>
                    <li className={stats.passButRejected > 0 ? "font-medium text-destructive" : undefined}>
                      {stats.passButRejected} passed the checks but your team sent them back (this should stay at 0 before you switch to Automatic).
                    </li>
                    <li>{stats.failButApproved} failed a check but your team approved them anyway (the checks were stricter than needed).</li>
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="sm:col-span-full">
            {state.message && (
              <p className={`mb-3 text-sm font-medium ${state.ok ? "text-[#1f7a4d]" : "text-destructive"}`} role="status">
                {state.message}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save automation settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
