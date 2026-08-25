"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, resetPassword, type RecoveryState } from "@/app/actions/account-recovery";

const initial: RecoveryState = { ok: false, message: "" };

export function ForgotPasswordForm({ defaultType }: { defaultType: "academy" | "analytics" | "portal" }) {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  return <form action={action} className="mt-6 space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-semibold">Account</span><select name="accountType" defaultValue={defaultType} className="h-11 w-full rounded-xl border bg-white px-3 text-sm"><option value="academy">Academy learner</option><option value="analytics">Analytics subscriber</option><option value="portal">Inspection client portal</option></select></label><Field label="Email address" name="email" type="email" autoComplete="email" required />{state.message ? <p className={`rounded-xl p-3 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{state.message}</p> : null}<button disabled={pending} className="btn-gold w-full py-3">{pending ? "Sending…" : "Send reset link"}</button><p className="text-center text-xs text-ink-faint">Admin password changes are managed through the deployment environment.</p></form>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, initial);
  if (state.ok && state.loginHref) return <div className="mt-6 rounded-xl bg-green-50 p-5 text-sm text-green-800"><p>{state.message}</p><Link href={state.loginHref} className="mt-4 inline-flex font-bold underline">Continue to sign in</Link></div>;
  return <form action={action} className="mt-6 space-y-4"><input type="hidden" name="token" value={token} /><Field label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required /><Field label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />{state.message ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{state.message}</p> : null}<button disabled={pending || !token} className="btn-gold w-full py-3 disabled:opacity-50">{pending ? "Updating…" : "Update password"}</button></form>;
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { const { label, ...inputProps } = props; return <label className="block"><span className="mb-1.5 block text-xs font-semibold">{label}</span><input {...inputProps} className="h-11 w-full rounded-xl border bg-white px-3.5 text-sm outline-none focus:border-gold-600 focus:ring-2 focus:ring-gold-500/20" /></label>; }
