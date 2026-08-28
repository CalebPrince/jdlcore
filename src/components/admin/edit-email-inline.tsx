"use client";

import { useActionState, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import type { FormState } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: FormState = { ok: false, message: "" };

export function EditEmailInline({
  id,
  email,
  action,
}: {
  id: number;
  email: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(action, initial);

  const [lastHandledState, setLastHandledState] = useState(state);
  if (state !== lastHandledState) {
    setLastHandledState(state);
    if (state.ok) setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-navy-950"
      >
        {email}
        <Pencil className="h-3 w-3 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <Input
        name="email"
        type="email"
        defaultValue={email}
        required
        className="h-7 w-48 text-xs"
        autoFocus
      />
      <Button type="submit" size="icon-sm" variant="ghost" disabled={pending} aria-label="Save email">
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={() => setEditing(false)}
        aria-label="Cancel"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
      {!state.ok && state.message && (
        <span className="text-[0.7rem] text-red-600">{state.message}</span>
      )}
    </form>
  );
}
