"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  submitQuoteRequest,
  type FormState,
} from "@/app/actions/submissions";

const SERVICES = [
  "Stock Monitoring",
  "Collateral Verification",
  "Tank & Depot Inspections",
  "Quantity Verification",
  "Reconciliation & Exception Reporting",
  "Loading & Discharge Supervision",
  "Inventory Audit Support",
  "Loss & Discrepancy Investigation",
  "Documentation & Reporting",
  "Stock Control Advisory",
  "Not sure yet",
];

const initial: FormState = { ok: false, message: "" };

const inputClass =
  "w-full rounded-[var(--radius-sm)] border-[1.5px] bg-white px-3.5 py-[0.75em] text-inherit focus:border-gold-600 focus:outline-none";
const labelClass = "text-[0.85rem] font-semibold text-navy-950";

export function QuoteForm() {
  const [state, action, pending] = useActionState(submitQuoteRequest, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid max-w-[760px] grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2"
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="qf-name" className={labelClass}>
          Full Name
        </label>
        <input id="qf-name" name="name" type="text" autoComplete="name" required className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="qf-company" className={labelClass}>
          Company
        </label>
        <input id="qf-company" name="company" type="text" autoComplete="organization" className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="qf-phone" className={labelClass}>
          Phone Number
        </label>
        <input id="qf-phone" name="phone" type="tel" autoComplete="tel" required className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="qf-email" className={labelClass}>
          Email
        </label>
        <input id="qf-email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-full">
        <label htmlFor="qf-service" className={labelClass}>
          Service Needed
        </label>
        <select id="qf-service" name="service" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Select a service
          </option>
          {SERVICES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5 sm:col-span-full">
        <label htmlFor="qf-details" className={labelClass}>
          Job Details
        </label>
        <textarea
          id="qf-details"
          name="details"
          rows={4}
          placeholder="Site location, timing, and anything else we should know"
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn-gold btn-gold-lg justify-self-start mt-1.5 disabled:pointer-events-none disabled:opacity-55 sm:col-span-full"
      >
        {pending ? "Sending…" : "Submit Request"}
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
