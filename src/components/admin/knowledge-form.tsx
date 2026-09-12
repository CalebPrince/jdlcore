"use client";

import { useActionState, useEffect, useState } from "react";
import { savePlatformKnowledge, rollbackPlatformKnowledge } from "@/app/actions/knowledge-admin";
import type { KnowledgeRegistry } from "@/lib/ai/knowledge-store";
import { renderPlatformKnowledge, type PlatformKnowledge } from "@/lib/ai/platform-knowledge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const fields = { id: "Division identifier", name: "Division name", purpose: "Purpose", capabilities: "Application capabilities", workflow: "Workflow", roles: "Users and access boundaries", pages: "Pages and where to go", limitations: "Limitations", reviewNotes: "Business review notes (Admin only)" } as const;

export function KnowledgeForm({ registry }: { registry: KnowledgeRegistry }) {
  const [knowledge, setKnowledge] = useState<PlatformKnowledge>(registry.draft);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [state, action, pending] = useActionState(savePlatformKnowledge, { ok: false, message: "", revision: registry.revision });
  const [rollbackState, rollbackAction, rollbackPending] = useActionState(rollbackPlatformKnowledge, { ok: false, message: "", revision: state.revision });
  const revision = Math.max(state.revision, rollbackState.revision);

  // Rollback changes the draft server-side to old content this component never
  // saw; reload so the form (and history list) reflect it rather than showing
  // stale local edits alongside a bumped revision number.
  useEffect(() => {
    if (rollbackState.ok) window.location.reload();
  }, [rollbackState.ok]);

  return <Card>
    <CardHeader><CardTitle>Platform knowledge</CardTitle>
      <p className="text-sm text-muted-foreground">Teach the assistants what each division does. Only publish public product information; never include private records or secrets. Adding a division here teaches the assistant about it but does not create pages or actions.</p>
      <p className="text-sm text-muted-foreground">{registry.publishedVersion === 0 ? "Using the code-based baseline; business review is pending." : `Published version ${registry.publishedVersion} · ${registry.publishedAt?.slice(0, 10)}`} Last editor: {registry.updatedBy}.</p>
    </CardHeader>
    <CardContent><form action={action} className="space-y-6">
      <input type="hidden" name="knowledge" value={JSON.stringify(knowledge)} />
      <input type="hidden" name="revision" value={revision} />
      <fieldset disabled={pending} className="space-y-6">
        <div className="space-y-2"><Label htmlFor="knowledge-company">Company overview</Label><Textarea id="knowledge-company" required maxLength={2400} rows={4} value={knowledge.company} onChange={(e) => setKnowledge({ ...knowledge, company: e.target.value })} /></div>
        {knowledge.divisions.map((division, index) => <details key={index} className="rounded-xl border p-4">
          <summary className="cursor-pointer font-medium">
            {division.name || "New division"}
            {division.needsReview && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Needs review</span>}
          </summary>
          <div className="mt-4 space-y-4">
            {Object.entries(fields).map(([field, label]) => {
              const key = field as keyof typeof fields;
              const id = `division-${index}-${key}`;
              const props = { id, required: key !== "reviewNotes", value: division[key], maxLength: key === "id" ? 50 : key === "name" ? 100 : 2400,
                onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setKnowledge((previous) => ({ ...previous, divisions: previous.divisions.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item) })) };
              return <div key={key} className="space-y-2"><Label htmlFor={id}>{label}</Label>{key === "id" || key === "name" ? <Input {...props} /> : <Textarea {...props} rows={3} />}</div>;
            })}
            <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium" htmlFor={`division-${index}-needsReview`}>
                <input
                  id={`division-${index}-needsReview`}
                  type="checkbox"
                  checked={division.needsReview}
                  onChange={(event) => setKnowledge((previous) => ({ ...previous, divisions: previous.divisions.map((item, i) => i === index ? { ...item, needsReview: event.target.checked } : item) }))}
                />
                Flag this division for review (e.g. after related application code changed)
              </label>
              {division.needsReview && (
                <Input
                  aria-label="Reason this division needs review"
                  placeholder="What changed and needs a re-check?"
                  maxLength={500}
                  value={division.needsReviewNote}
                  onChange={(event) => setKnowledge((previous) => ({ ...previous, divisions: previous.divisions.map((item, i) => i === index ? { ...item, needsReviewNote: event.target.value } : item) }))}
                />
              )}
            </div>
            <Button type="button" variant="outline" disabled={knowledge.divisions.length === 1} onClick={() => setKnowledge({ ...knowledge, divisions: knowledge.divisions.filter((_, i) => i !== index) })}>Remove from draft</Button>
          </div>
        </details>)}
        <Button type="button" variant="outline" disabled={knowledge.divisions.length >= 30} onClick={() => setKnowledge({ ...knowledge, divisions: [...knowledge.divisions, { id: "", name: "", purpose: "", capabilities: "", workflow: "", roles: "", pages: "", limitations: "", reviewNotes: "", needsReview: false, needsReviewNote: "" }] })}>Add division</Button>
        <p className="text-sm text-muted-foreground">Review every division and its business review notes before publishing. Saving a draft preserves the currently published knowledge.</p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="intent" value="draft" variant="outline" formNoValidate>Save draft</Button>
          <Button type="submit" name="intent" value="publish" formNoValidate>Publish knowledge</Button>
          <Button type="button" variant="outline" onClick={() => setShowPreview((v) => !v)}>{showPreview ? "Hide" : "Preview"} exact context</Button>
        </div>
      </fieldset>
      {state.message && <p role="status" className={state.ok ? "text-sm text-green-700" : "text-sm text-red-700"}>{state.message}</p>}
    </form>

    {showPreview && (
      <div className="mt-6 space-y-2">
        <p className="text-sm text-muted-foreground">Exactly what the assistants would receive if this draft were published right now (a large catalogue may rank and trim divisions per question; this preview shows the unranked full set).</p>
        <pre className="max-h-96 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs whitespace-pre-wrap">{renderPlatformKnowledge(knowledge, { budgetChars: Number.MAX_SAFE_INTEGER })}</pre>
      </div>
    )}

    <div className="mt-6 space-y-3 border-t pt-6">
      <Button type="button" variant="outline" onClick={() => setShowHistory((v) => !v)}>{showHistory ? "Hide" : "Show"} publish history ({registry.history.length})</Button>
      {showHistory && (
        registry.history.length === 0
          ? <p className="text-sm text-muted-foreground">No prior published versions yet.</p>
          : <ul className="space-y-2">
            {registry.history.map((entry) => <li key={entry.version} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span>Version {entry.version} · {entry.publishedAt?.slice(0, 10) ?? "unknown date"} · {entry.publishedBy}</span>
              <form action={rollbackAction}>
                <input type="hidden" name="revision" value={revision} />
                <input type="hidden" name="version" value={entry.version} />
                <Button type="submit" size="sm" variant="outline" disabled={rollbackPending}>Roll back to this version</Button>
              </form>
            </li>)}
          </ul>
      )}
      {rollbackState.message && <p role="status" className={rollbackState.ok ? "text-sm text-green-700" : "text-sm text-red-700"}>{rollbackState.message}</p>}
    </div>
    </CardContent>
  </Card>;
}
