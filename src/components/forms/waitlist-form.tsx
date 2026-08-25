"use client";

import { useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function WaitlistForm({
  action,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex max-w-[480px] flex-wrap gap-3" noValidate>
      <input
        type="email"
        name="email"
        placeholder="you@company.com"
        aria-label="Email address"
        required
        className="min-w-[220px] flex-1 rounded-[var(--radius-sm)] border-[1.5px] bg-white px-3.5 py-[0.75em] focus:border-gold-600 focus:outline-none"
      />
      <button type="submit" disabled={pending} className="btn-gold btn-gold-lg disabled:pointer-events-none disabled:opacity-55">
        {pending ? "Sending…" : "Notify Me"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`w-full min-h-[1.4em] text-[0.88rem] ${state.ok ? "font-semibold text-[#1f7a4d]" : "text-ink-soft"}`}
      >
        {state.message}
      </p>
    </form>
  );
}
