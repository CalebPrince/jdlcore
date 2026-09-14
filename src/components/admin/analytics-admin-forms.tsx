"use client";

import { useRef, useState } from "react";
import { useActionState } from "react";
import {
  grantAnalyticsAccess,
  syncNpaKnowledgeNow,
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
        <Input id="knowledge-file" name="file" type="file" accept=".pdf,.txt,.md,.csv,.json,.xlsx,.docx" required />
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

type NpaProgress = {
  status: "idle" | "running" | "paused" | "done" | "error";
  scanned: number;
  remaining: number | null;
  added: number;
  failed: number;
  skippedUnsupported: number;
  message: string;
};

const initialNpaProgress: NpaProgress = {
  status: "idle",
  scanned: 0,
  remaining: null,
  added: 0,
  failed: 0,
  skippedUnsupported: 0,
  message: "",
};

/**
 * Drains the NPA backlog automatically (a daily cron also runs this — see
 * api/cron/npa-sync — but that's capped to ~30 docs/day, too slow for an
 * ~977-document backfill). Each underlying call is still one bounded batch
 * (server function limits), so this loops client-side, pausing briefly
 * between calls, and shows live progress toward the true total. Safe to
 * leave and come back to — progress lives in the database, not this
 * component, so a paused/closed sync just resumes where it left off.
 */
export function NpaSyncButton() {
  const [progress, setProgress] = useState<NpaProgress>(initialNpaProgress);
  const stopRequested = useRef(false);

  async function runLoop() {
    stopRequested.current = false;
    setProgress((p) => ({ ...p, status: "running", message: "" }));
    for (;;) {
      if (stopRequested.current) {
        setProgress((p) => ({ ...p, status: "paused" }));
        return;
      }
      const res = await syncNpaKnowledgeNow();
      if (!res.ok || !res.result) {
        setProgress((p) => ({ ...p, status: "error", message: res.message }));
        return;
      }
      const r = res.result;
      setProgress((p) => ({
        ...p,
        scanned: r.scanned,
        remaining: r.remaining,
        added: p.added + r.added,
        failed: p.failed + r.failed,
        skippedUnsupported: p.skippedUnsupported + r.skippedUnsupported,
      }));
      if (r.remaining <= 0) {
        setProgress((p) => ({ ...p, status: "done" }));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  const done = progress.remaining === null ? 0 : Math.max(0, progress.scanned - progress.remaining);
  const pct = progress.scanned > 0 ? Math.min(100, Math.round((done / progress.scanned) * 100)) : 0;
  const running = progress.status === "running";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              stopRequested.current = true;
            }}
          >
            Pause sync
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={runLoop}>
            {progress.status === "done" ? "Sync again" : progress.status === "paused" ? "Resume sync" : "Sync all NPA documents"}
          </Button>
        )}
        {progress.scanned > 0 && (
          <span className="text-xs text-muted-foreground">
            {done} / {progress.scanned} documents ({pct}%){running ? " — syncing…" : ""}
          </span>
        )}
      </div>
      {progress.scanned > 0 && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gold-600 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {(progress.added > 0 || progress.failed > 0 || progress.skippedUnsupported > 0) && (
        <p className="m-0 text-xs text-muted-foreground">
          Added {progress.added} this run
          {progress.failed > 0 && ` · ${progress.failed} failed`}
          {progress.skippedUnsupported > 0 && ` · ${progress.skippedUnsupported} unsupported file type`}
        </p>
      )}
      {progress.status === "error" && progress.message && (
        <Alert variant="destructive">
          <AlertDescription>{progress.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
