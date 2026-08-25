"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { createAcademyCourse } from "@/app/actions/academy-admin";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

export function AcademyCourseForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createAcademyCourse, initial);
  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-navy-950 px-5 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4"/>New course</button>;
  return <div className="fixed inset-0 z-50 grid place-items-center p-4"><button aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-navy-950/55"/><form action={action} className="relative z-10 w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center justify-between"><div><h2 className="text-xl">Create course</h2><p className="text-xs text-ink-faint">The new course starts as a draft.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg border p-2"><X className="h-4 w-4"/></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Course title" name="title" required/><Field label="Course code" name="code" placeholder="JDL-QV02" required/><Field label="URL slug" name="slug" placeholder="quantity-verification" required/><label className="block"><span className="mb-1 block text-xs font-semibold">Level</span><select name="level" className="h-10 w-full rounded-lg border px-3 text-sm"><option>Foundation</option><option>Intermediate</option><option>Professional</option></select></label><Field label="Estimated minutes" name="estimatedMinutes" type="number" defaultValue="60" required/><label className="block sm:col-span-2"><span className="mb-1 block text-xs font-semibold">Summary</span><textarea name="summary" required rows={3} className="w-full rounded-lg border px-3 py-2 text-sm"/></label></div>{state.message ? <p className={`mt-4 rounded-lg p-3 text-sm ${state.ok?"bg-green-50 text-green-700":"bg-red-50 text-red-700"}`}>{state.message}</p>:null}<button disabled={pending} className="btn-gold mt-5">{pending?"Creating…":"Create draft"}</button></form></div>;
}
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & {label:string}){const {label,...rest}=props;return <label className="block"><span className="mb-1 block text-xs font-semibold">{label}</span><input {...rest} className="h-10 w-full rounded-lg border px-3 text-sm"/></label>}
