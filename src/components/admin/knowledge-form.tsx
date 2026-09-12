"use client";

import { useActionState, useState } from "react";
import { savePlatformKnowledge } from "@/app/actions/knowledge-admin";
import type { KnowledgeRegistry } from "@/lib/ai/knowledge-store";
import type { PlatformKnowledge } from "@/lib/ai/platform-knowledge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const fields = { id: "Division identifier", name: "Division name", purpose: "Purpose", capabilities: "Application capabilities", workflow: "Workflow", roles: "Users and access boundaries", pages: "Pages and where to go", limitations: "Limitations", reviewNotes: "Business review notes (Admin only)" } as const;

export function KnowledgeForm({ registry }: { registry: KnowledgeRegistry }) {
  const [knowledge, setKnowledge] = useState<PlatformKnowledge>(registry.draft);
  const [state, action, pending] = useActionState(savePlatformKnowledge, { ok: false, message: "", revision: registry.revision });
  return <Card>
    <CardHeader><CardTitle>Platform knowledge</CardTitle>
      <p className="text-sm text-muted-foreground">Teach the assistants what each division does. Only publish public product information; never include private records or secrets. Adding a division here teaches the assistant about it but does not create pages or actions.</p>
      <p className="text-sm text-muted-foreground">{registry.publishedVersion === 0 ? "Using the code-based baseline; business review is pending." : `Published version ${registry.publishedVersion} · ${registry.publishedAt?.slice(0, 10)}`} Last editor: {registry.updatedBy}.</p>
    </CardHeader>
    <CardContent><form action={action} className="space-y-6">
      <input type="hidden" name="knowledge" value={JSON.stringify(knowledge)} />
      <input type="hidden" name="revision" value={state.revision} />
      <fieldset disabled={pending} className="space-y-6">
        <div className="space-y-2"><Label htmlFor="knowledge-company">Company overview</Label><Textarea id="knowledge-company" required maxLength={2400} rows={4} value={knowledge.company} onChange={(e) => setKnowledge({ ...knowledge, company: e.target.value })} /></div>
        {knowledge.divisions.map((division, index) => <details key={index} className="rounded-xl border p-4">
          <summary className="cursor-pointer font-medium">{division.name || "New division"}</summary>
          <div className="mt-4 space-y-4">
            {Object.entries(fields).map(([field, label]) => {
              const key = field as keyof typeof fields;
              const id = `division-${index}-${key}`;
              const props = { id, required: key !== "reviewNotes", value: division[key], maxLength: key === "id" ? 50 : key === "name" ? 100 : 2400,
                onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setKnowledge((previous) => ({ ...previous, divisions: previous.divisions.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item) })) };
              return <div key={key} className="space-y-2"><Label htmlFor={id}>{label}</Label>{key === "id" || key === "name" ? <Input {...props} /> : <Textarea {...props} rows={3} />}</div>;
            })}
            <Button type="button" variant="outline" disabled={knowledge.divisions.length === 1} onClick={() => setKnowledge({ ...knowledge, divisions: knowledge.divisions.filter((_, i) => i !== index) })}>Remove from draft</Button>
          </div>
        </details>)}
        <Button type="button" variant="outline" disabled={knowledge.divisions.length >= 30} onClick={() => setKnowledge({ ...knowledge, divisions: [...knowledge.divisions, { id: "", name: "", purpose: "", capabilities: "", workflow: "", roles: "", pages: "", limitations: "", reviewNotes: "" }] })}>Add division</Button>
        <p className="text-sm text-muted-foreground">Review every division and its business review notes before publishing. Saving a draft preserves the currently published knowledge.</p>
        <div className="flex flex-wrap gap-3"><Button type="submit" name="intent" value="draft" variant="outline" formNoValidate>Save draft</Button><Button type="submit" name="intent" value="publish" formNoValidate>Publish knowledge</Button></div>
      </fieldset>
      {state.message && <p role="status" className={state.ok ? "text-sm text-green-700" : "text-sm text-red-700"}>{state.message}</p>}
    </form></CardContent>
  </Card>;
}
