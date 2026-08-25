"use client";

import { useActionState } from "react";
import {
  updateContactSettings,
  type AdminState,
} from "@/app/actions/admin";
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

const initial: AdminState = { ok: false, message: "" };

export function ContactSettingsForm({
  defaults,
}: {
  defaults: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(
    updateContactSettings,
    initial
  );

  const fields: { name: string; label: string; hint?: string; type?: string }[] =
    [
      { name: "phoneDisplay", label: "Phone (display)", hint: "Shown to visitors, e.g. +233 24 000 0000" },
      { name: "phoneHref", label: "Phone (dial link)", hint: "Number used for the tel: link" },
      { name: "emailInfo", label: "General email", type: "email" },
      { name: "emailInspections", label: "Inspections email", type: "email" },
      { name: "emailAcademy", label: "Academy email", type: "email" },
      { name: "address", label: "Address" },
      { name: "whatsappNumber", label: "WhatsApp number", hint: "Digits only with country code, e.g. 233243849861" },
      { name: "whatsappDisplay", label: "WhatsApp (display)" },
      { name: "whatsappMessage", label: "WhatsApp prefilled message" },
    ];

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="font-display">Contact Details</CardTitle>
        <CardDescription>
          These details appear in every footer and on the contact page. Saving
          updates them live across the site.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.name} className="flex flex-col gap-2">
              <Label htmlFor={f.name}>{f.label}</Label>
              <Input
                id={f.name}
                name={f.name}
                type={f.type ?? "text"}
                defaultValue={defaults[f.name] ?? ""}
                required
              />
              {f.hint && (
                <p className="text-xs text-muted-foreground">{f.hint}</p>
              )}
            </div>
          ))}

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
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
