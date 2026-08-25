"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  submitContactMessage,
  type FormState,
} from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

const inputClass =
  "w-full rounded-[var(--radius-sm)] border-[1.5px] bg-white px-3.5 py-[0.75em] text-inherit focus:border-gold-600 focus:outline-none";
const labelClass = "text-[0.85rem] font-semibold text-navy-950";

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContactMessage, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2" noValidate>
      <div className="flex flex-col gap-1.5 sm:col-span-full">
        <label htmlFor="cf-topic" className={labelClass}>
          This is about
        </label>
        <select id="cf-topic" name="topic" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Select a division
          </option>
          <option>Inspection Services</option>
          <option>Analytics</option>
          <option>Academy</option>
          <option>Something else</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cf-name" className={labelClass}>
          Full Name
        </label>
        <input id="cf-name" name="name" type="text" autoComplete="name" required className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="cf-email" className={labelClass}>
          Email
        </label>
        <input id="cf-email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-full">
        <label htmlFor="cf-phone" className={labelClass}>
          Phone Number
        </label>
        <input id="cf-phone" name="phone" type="tel" autoComplete="tel" className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-full">
        <label htmlFor="cf-message" className={labelClass}>
          Message
        </label>
        <textarea id="cf-message" name="message" rows={5} required className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className="btn-gold btn-gold-lg justify-self-start mt-1.5 disabled:pointer-events-none disabled:opacity-55 sm:col-span-full">
        {pending ? "Sending…" : "Send Message"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className={`min-h-[1.4em] text-[0.88rem] sm:col-span-full ${state.ok ? "font-semibold text-[#1f7a4d]" : "text-ink-soft"}`}
      >
        {state.message}
      </p>
    </form>
  );
}
