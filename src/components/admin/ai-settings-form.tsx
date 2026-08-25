"use client";

import { useActionState } from "react";
import { saveAiSettings } from "@/app/actions/ai-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ProviderName } from "@/lib/ai/settings";

export type AiSettingsView = {
  providers: Record<
    ProviderName,
    { label: string; model: string; enabled: boolean; maskedKey: string | null; hasKey: boolean }
  >;
  chatPersona: string;
};

type ProviderFields = {
  name: ProviderName;
  blurb: string;
  keyPlaceholder: string;
};

const PROVIDER_FIELDS: ProviderFields[] = [
  {
    name: "gemini",
    blurb: "Google AI Studio key. Tried first.",
    keyPlaceholder: "AIza...",
  },
  {
    name: "anthropic",
    blurb: "Anthropic Console key. Second in line.",
    keyPlaceholder: "sk-ant-...",
  },
  {
    name: "groq",
    blurb: "Groq Cloud key. Last resort, very fast.",
    keyPlaceholder: "gsk_...",
  },
];

export function AiSettingsForm({ view }: { view: AiSettingsView }) {
  const [state, action, pending] = useActionState(saveAiSettings, {
    ok: false,
    message: "",
  });

  return (
    <form action={action} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display">Providers &amp; API Keys</CardTitle>
          <CardDescription>
            Requests run through the chain in order. If a provider fails or times out,
            the next one takes over automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {PROVIDER_FIELDS.map((p) => {
            const v = view.providers[p.name];
            return (
              <div key={p.name} className="rounded-xl border p-4">
                <input type="hidden" name={`${p.name}Enabled`} value={v.enabled ? "on" : ""} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-navy-950">{v.label}</p>
                    <p className="text-xs text-muted-foreground">{p.blurb}</p>
                  </div>
                  <ProviderSwitch name={p.name} defaultEnabled={v.enabled} />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${p.name}-key`}>API key</Label>
                    <Input
                      id={`${p.name}-key`}
                      type="password"
                      name={`${p.name}Key`}
                      autoComplete="off"
                      placeholder={
                        v.maskedKey ? `Stored (${v.maskedKey}) - leave blank to keep` : p.keyPlaceholder
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${p.name}-model`}>Model</Label>
                    <Input
                      id={`${p.name}-model`}
                      name={`${p.name}Model`}
                      defaultValue={v.model}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Assistant Instructions</CardTitle>
          <CardDescription>
            Extra guidance for the live chat assistant (persona, tone, rules). Appended to
            the built-in site context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            name="chatPersona"
            rows={6}
            maxLength={4000}
            defaultValue={view.chatPersona}
            placeholder="e.g. Always greet visitors by asking how we can help with their property..."
            className="min-h-32"
          />
        </CardContent>
      </Card>

      {!state.ok && state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.ok && (
        <Alert className="border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
          <AlertDescription className="text-[#1f7a4d]">{state.message}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending} className="btn-gold self-start">
        {pending ? "Saving..." : "Save AI Settings"}
      </Button>
    </form>
  );
}

function ProviderSwitch({ name, defaultEnabled }: { name: ProviderName; defaultEnabled: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <Switch
        formAction={undefined}
        name={`${name}-enabled-ui`}
        defaultChecked={defaultEnabled}
        onCheckedChange={(checked) => {
          const hidden = document.querySelector<HTMLInputElement>(
            `input[name="${name}Enabled"]`,
          );
          if (hidden) hidden.value = checked ? "on" : "";
        }}
      />
      Enabled
    </label>
  );
}
