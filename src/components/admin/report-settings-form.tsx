"use client";

import { useActionState } from "react";
import { updateReportSettings, type AdminState } from "@/app/actions/admin";
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
import type { ReportSettings } from "@/lib/settings";

const initial: AdminState = { ok: false, message: "" };

export function ReportSettingsForm({ defaults }: { defaults: ReportSettings }) {
  const [state, action, pending] = useActionState(updateReportSettings, initial);

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="font-display">Report Template</CardTitle>
        <CardDescription>
          Controls the numbering and fixed text on the Certificate of Quantity PDF
          (and the tagline shown on both the COQ and invoice headers).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="coqPrefix">Certificate number prefix</Label>
            <Input id="coqPrefix" name="coqPrefix" defaultValue={defaults.coqPrefix} required />
            <p className="text-xs text-muted-foreground">e.g. COQ — produces COQ-2026-0001</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="headerTagline">Header tagline</Label>
            <Input
              id="headerTagline"
              name="headerTagline"
              defaultValue={defaults.headerTagline}
              maxLength={60}
              required
            />
            <p className="text-xs text-muted-foreground">Shown under “JDL Core” on both PDFs.</p>
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label htmlFor="certifyingStatement">Certifying statement (COQ footer)</Label>
            <Input
              id="certifyingStatement"
              name="certifyingStatement"
              defaultValue={defaults.certifyingStatement}
              maxLength={220}
              required
            />
          </div>

          <div className="sm:col-span-full">
            {state.message && (
              <p
                className={`mb-3 text-sm font-medium ${
                  state.ok ? "text-[#1f7a4d]" : "text-destructive"
                }`}
                role="status"
              >
                {state.message}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save report template"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
