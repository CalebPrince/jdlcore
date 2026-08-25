"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { convertQuoteToJob, type ConvertState } from "@/app/actions/portal-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const SERVICES = [
  "Stock Monitoring",
  "Collateral Verification",
  "Tank & Depot Inspections",
  "Quantity Verification",
  "Reconciliation & Exception Reporting",
  "Loading & Discharge Supervision",
  "Inventory Audit Support",
  "Loss & Discrepancy Investigation",
  "Documentation & Reporting",
  "Stock Control Advisory",
  "Not sure yet",
];

const initial: ConvertState = { ok: false, message: "" };

export type ClientOption = {
  id: number;
  name: string;
  company: string | null;
  email: string;
};

export type SubmissionData = {
  id: number;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  service: string | null;
  message: string | null;
};

export function ConvertQuoteSheet({
  submission,
  clients,
}: {
  submission: SubmissionData;
  clients: ClientOption[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">(
    clients.length > 0 ? "new" : "new",
  );
  const [clientId, setClientId] = useState<string>("");
  const [state, action, pending] = useActionState(convertQuoteToJob, initial);

  const done = state.ok && state.jobId;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 whitespace-nowrap">
          Convert to Job
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display">Convert to Portal Job</SheetTitle>
          <SheetDescription>
            Create a client account and job from this request. Fields are
            pre-filled from the submission.
          </SheetDescription>
        </SheetHeader>

        {done ? (
          <div className="mt-6 flex flex-col gap-4">
            <Alert className="border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
              <AlertDescription className="text-[#1f7a4d]">
                {state.message}
              </AlertDescription>
            </Alert>
            {state.tempPassword && (
              <div className="rounded-xl border border-dashed p-4" style={{ borderColor: "var(--border)" }}>
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Temporary portal password
                </p>
                <code className="mt-1 block select-all font-mono text-base font-bold text-navy-950">
                  {state.tempPassword}
                </code>
                <p className="m-0 mt-2 text-xs text-muted-foreground">
                  {state.emailSent
                    ? `Also emailed to ${submission.email}.`
                    : "Email notifications aren't configured — share this with the client manually."}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button asChild className="btn-gold flex-1">
                <Link href={`/admin/jobs/${state.jobId}`}>Open Job</Link>
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form action={action} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="submissionId" value={submission.id} />
            <input type="hidden" name="mode" value={mode} />

            {clients.length > 0 && (
              <div className="flex gap-2 rounded-lg border p-1" style={{ borderColor: "var(--border)" }}>
                {(["new", "existing"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      mode === m
                        ? "bg-navy-950 text-paper"
                        : "text-muted-foreground hover:text-navy-950"
                    }`}
                  >
                    {m === "new" ? "New client" : "Existing client"}
                  </button>
                ))}
              </div>
            )}

            {mode === "existing" ? (
              <div className="flex flex-col gap-1.5">
                <Label>Client</Label>
                <Select name="clientId" value={clientId} onValueChange={setClientId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a client…" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.company || c.name} ({c.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <input type="hidden" name="email" value={submission.email ?? ""} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cv-name">Name</Label>
                    <Input id="cv-name" name="name" defaultValue={submission.name} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cv-company">Company</Label>
                    <Input id="cv-company" name="company" defaultValue={submission.company ?? ""} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Email (login)</Label>
                  <Input value={submission.email ?? ""} disabled className="bg-muted/40" />
                  {!submission.email && (
                    <p className="m-0 text-xs text-red-600">
                      This request has no email — a portal login can&apos;t be created.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cv-phone">Phone</Label>
                  <Input id="cv-phone" name="phone" defaultValue={submission.phone ?? ""} />
                </div>
              </>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cv-service">Service</Label>
              <Input
                id="cv-service"
                name="service"
                defaultValue={submission.service ?? ""}
                list="convert-services"
                required
              />
              <datalist id="convert-services">
                {SERVICES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cv-location">Location</Label>
              <Input id="cv-location" name="location" placeholder="Depot / site" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cv-notes">Notes for the job</Label>
              <textarea
                id="cv-notes"
                name="notes"
                rows={4}
                defaultValue={submission.message ?? ""}
                className="w-full rounded-[var(--radius-sm)] border-[1.5px] bg-white px-3 py-2 text-sm focus:border-gold-600 focus:outline-none"
                style={{ borderColor: "var(--border)" }}
              />
            </div>

            {!state.ok && state.message && (
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={pending || !submission.email} className="btn-gold">
              {pending ? "Converting…" : "Create Client + Job"}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
