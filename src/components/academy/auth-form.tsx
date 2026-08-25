"use client";

import Link from "next/link";
import { useActionState } from "react";
import { academyLogin, academyRegister } from "@/app/actions/academy";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function AcademyAuthForm({ mode }: { mode: "login" | "register" }) {
  const [state, action, pending] = useActionState(mode === "login" ? academyLogin : academyRegister, initial);
  return <form action={action} className="mt-7 space-y-4">
    {mode === "register" ? <>
      <Field label="Full name" name="name" autoComplete="name" required placeholder="Kwame Mensah" />
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Company" name="company" autoComplete="organization" placeholder="Optional" /><Field label="Job role" name="role" placeholder="Inspector trainee" /></div>
    </> : null}
    <Field label="Email address" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
    <Field label="Password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : undefined} placeholder={mode === "register" ? "At least 8 characters" : "Your password"} />
    {state.message ? <p className={`rounded-xl p-3 text-sm ${state.ok ? "bg-[#e5f3eb] text-[#23734a]" : "bg-red-50 text-red-700"}`}>{state.message}</p> : null}
    <button disabled={pending} className="btn-gold w-full py-3.5 disabled:opacity-50">{pending ? "Please wait…" : mode === "login" ? "Sign in to Academy" : "Create learner account"}</button>
    <p className="text-center text-sm text-ink-faint">{mode === "login" ? "New to JDL Academy?" : "Already have an account?"} <Link className="font-semibold text-navy-800" href={mode === "login" ? "/academy/register" : "/academy/login"}>{mode === "login" ? "Create account" : "Sign in"}</Link></p>
  </form>;
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...inputProps } = props;
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-navy-950">{label}</span><input {...inputProps} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3.5 text-sm outline-none transition focus:border-gold-600 focus:ring-2 focus:ring-gold-500/20" /></label>;
}
