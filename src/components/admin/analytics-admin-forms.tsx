"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  grantAnalyticsAccess,
  uploadKnowledgeDocument,
  type GrantState,
  type KnowledgeUploadState,
} from "@/app/actions/analytics-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const initial: GrantState = { ok: false, message: "" };

export function AnalyticsGrantSheet({
  label,
  variant = "default",
  defaults,
}: {
  label: string;
  variant?: "default" | "ghost" | "outline";
  defaults?: { name?: string; email?: string; company?: string | null; phone?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(grantAnalyticsAccess, initial);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant={variant} className="whitespace-nowrap">
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto px-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display">Grant Analytics access</SheetTitle>
          <SheetDescription>
            The person receives a one-time link to set their own password.
          </SheetDescription>
        </SheetHeader>

        {state.ok && state.setupLink ? (
          <div className="mt-6 flex flex-col gap-4">
            <Alert className="border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
              <AlertDescription className="text-[#1f7a4d]">{state.message}</AlertDescription>
            </Alert>
            <div className="rounded-xl border border-dashed p-4" style={{ borderColor: "var(--border)" }}>
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Setup link
                {state.emailed ? " (also emailed)" : " (email not configured — share manually)"}
              </p>
              <p className="m-0 mt-2 break-all font-mono text-xs text-navy-950 select-all">
                {state.setupLink}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(state.setupLink!);
              }}
            >
              Copy Link
            </Button>
          </div>
        ) : (
          <form action={action} className="mt-6 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ga-name">Name</Label>
              <Input id="ga-name" name="name" defaultValue={defaults?.name ?? ""} required minLength={2} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ga-email">Email</Label>
              <Input id="ga-email" name="email" type="email" defaultValue={defaults?.email ?? ""} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ga-company">Company</Label>
              <Input id="ga-company" name="company" defaultValue={defaults?.company ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ga-phone">Phone</Label>
              <Input id="ga-phone" name="phone" defaultValue={defaults?.phone ?? ""} />
            </div>
            {!state.ok && state.message && (
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" disabled={pending} className="btn-gold">
              {pending ? "Granting…" : "Grant Access"}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ConfirmSubmitButton({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      className="h-8 px-2 text-xs text-red-700 hover:text-red-800"
    >
      {children}
    </Button>
  );
}

const initialUpload: KnowledgeUploadState = { ok: false, message: "" };

export function KnowledgeUploadForm({ clients }: { clients: { id: number; label: string }[] }) {
  const [state, action, pending] = useActionState(uploadKnowledgeDocument, initialUpload);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.35fr_auto] lg:items-end">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="knowledge-title">Display title</Label>
        <Input id="knowledge-title" name="title" placeholder="Optional document title" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5"><Label htmlFor="knowledge-scope">Audience</Label><select id="knowledge-scope" name="scope" className="h-8 rounded-lg border bg-white px-2 text-sm"><option value="global">All subscribers</option><option value="client">One client</option></select></div>
        <div className="flex flex-col gap-1.5"><Label htmlFor="knowledge-client">Client</Label><select id="knowledge-client" name="clientId" className="h-8 rounded-lg border bg-white px-2 text-sm"><option value="">Select client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}</select></div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="knowledge-file">Document</Label>
        <Input id="knowledge-file" name="file" type="file" accept=".pdf,.txt,.md,.csv,.json" required />
      </div>
      <Button type="submit" disabled={pending} className="btn-gold">
        {pending ? "Indexing…" : "Upload & index"}
      </Button>
      {state.message && (
        <Alert variant={state.ok ? "default" : "destructive"} className="sm:col-span-2 lg:col-span-4">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
