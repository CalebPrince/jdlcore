import type { ReactNode } from "react";

export function MockupFrame({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  return (
    <div className="relative" aria-hidden="true">
      <span className="absolute -top-3.5 right-6 z-2 rounded-full bg-gold-500 px-4 py-[0.4em] text-[0.7rem] font-bold tracking-[0.04em] uppercase text-navy-950 shadow-[var(--shadow-sm-soft)]">
        Preview
      </span>
      <div className="overflow-hidden rounded-[var(--radius)] border bg-white shadow-[var(--shadow-md-soft)]" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2 bg-navy-950 px-4 py-3 text-[0.78rem] font-semibold tracking-[0.02em] text-paper">
          <span className="h-2 w-2 shrink-0 rounded-full bg-gold-500" />
          {url}
        </div>
        <div className="flex flex-col gap-3.5 p-5">{children}</div>
      </div>
    </div>
  );
}

function Stat({ num, lbl }: { num: string; lbl: string }) {
  return (
    <div className="flex-1 rounded-[var(--radius-sm)] bg-paper-deep px-3.5 py-3">
      <div className="font-display text-[1.3rem] font-bold leading-tight text-navy-950">
        {num}
      </div>
      <div className="text-[0.68rem] uppercase tracking-[0.05em] text-ink-faint">
        {lbl}
      </div>
    </div>
  );
}

type PillTone = "done" | "progress" | "review";

const pillStyles: Record<PillTone, string> = {
  done: "bg-[rgba(31,122,77,0.15)] text-[#1f7a4d]",
  progress: "bg-[rgba(238,176,43,0.18)] text-gold-600",
  review: "bg-navy-100 text-navy-800",
};

function Row({
  label,
  value,
  pill,
}: {
  label: string;
  value?: string;
  pill?: PillTone;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2.5 text-[0.82rem]"
      style={{ borderColor: "var(--border)" }}
    >
      {value ? (
        <>
          <span>{label}</span>
          <span className="font-semibold text-navy-950">{value}</span>
        </>
      ) : (
        <>
          <span className="font-semibold text-navy-950">{label}</span>
          {pill && (
            <span
              className={`rounded-full px-[0.7em] py-[0.28em] text-[0.65rem] font-bold tracking-[0.04em] whitespace-nowrap uppercase ${pillStyles[pill]}`}
            >
              {pill === "done" ? "Verified" : pill === "progress" ? "+12 this wk" : "In Progress"}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function OverviewMockup() {
  return (
    <MockupFrame url="overview.jdlcore.com">
      <div className="flex gap-2.5">
        <Stat num="Live" lbl="Inspection" />
        <Stat num="Soon" lbl="Analytics" />
        <Stat num="Soon" lbl="Academy" />
      </div>
      <Row label="JDL-2026-00041" pill="done" />
      <Row label="Analytics waitlist" pill="progress" />
      <Row label="Academy curriculum" pill="review" />
    </MockupFrame>
  );
}

export function CoqMockup() {
  return (
    <MockupFrame url="Certificate of Quantity">
      <Row label="JDL-2026-00041" pill="done" />
      <div className="flex gap-2.5">
        <Stat num="1.20M" lbl="GSV (Ltrs)" />
        <Stat num="1,031" lbl="Net Qty (MT)" />
        <Stat num="27.4°C" lbl="Avg Temp" />
      </div>
      <Row label="Product" value="Automotive Gas Oil" />
    </MockupFrame>
  );
}

export function PortalMockup() {
  return (
    <MockupFrame url="portal.jdlcore.com">
      <div className="flex gap-2.5">
        <Stat num="6" lbl="Open Requests" />
        <Stat num="3" lbl="In Progress" />
        <Stat num="21" lbl="Completed" />
      </div>
      <div className="flex flex-col gap-2">
        {[
          { ref: "JDL-2026-00041", tone: "progress", text: "Assigned" },
          { ref: "JDL-2026-00040", tone: "review", text: "In Review" },
          { ref: "JDL-2026-00039", tone: "done", text: "Approved" },
        ].map((r) => (
          <div
            key={r.ref}
            className="flex items-center justify-between gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2.5 text-[0.82rem]"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="font-semibold text-navy-950">{r.ref}</span>
            <span
              className={`rounded-full px-[0.7em] py-[0.28em] text-[0.65rem] font-bold tracking-[0.04em] uppercase ${pillStyles[r.tone as PillTone]}`}
            >
              {r.text}
            </span>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

export function AnalyticsChatMockup() {
  const bars = [40, 70, 35, 55, 20, 30];
  return (
    <MockupFrame url="analytics.jdlcore.com">
      <div className="flex flex-col gap-2.5">
        <div className="max-w-[84%] self-end rounded-2xl rounded-br-sm bg-navy-950 px-3.5 py-2.5 text-[0.85rem] leading-snug text-paper">
          What&apos;s our average GSV variance across Tema depots this quarter?
        </div>
        <div className="max-w-[84%] self-start rounded-2xl rounded-bl-sm bg-paper-deep px-3.5 py-2.5 text-[0.85rem] leading-snug text-ink">
          Average variance is 0.6% across 14 inspections, down from 1.1% last
          quarter.
          <div className="mt-2 flex h-8 items-end gap-1">
            {bars.map((h, i) => (
              <span key={i} className="flex-1 rounded-t-[2px] bg-gold-500" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}

export function AcademyMockup() {
  const courses = [
    { name: "Tank Gauging Basics", pct: 100 },
    { name: "Quantity Verification", pct: 60 },
    { name: "Collateral Basics", pct: 20 },
  ];
  return (
    <MockupFrame url="academy.jdlcore.com">
      <div>
        {courses.map((c) => (
          <div
            key={c.name}
            className="flex items-center gap-3 border-b border-dashed py-2.5 last:border-b-0"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="w-[118px] shrink-0 text-[0.82rem]">{c.name}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper-deep">
              <span className="block h-full bg-gold-500" style={{ width: `${c.pct}%` }} />
            </div>
            <span className="w-8 text-right text-[0.72rem] font-semibold text-ink-faint">
              {c.pct}%
            </span>
          </div>
        ))}
      </div>
      <div
        className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-gold-500 bg-[rgba(238,176,43,0.08)] px-3 py-2.5 text-[0.82rem]"
      >
        <span className="h-4 w-4 shrink-0 rounded-full border-2 border-gold-600 bg-gold-500" />
        GOV adjusted for temperature and water content
      </div>
      <div
        className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border px-3 py-2.5 text-[0.82rem]"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="h-4 w-4 shrink-0 rounded-full border-2" style={{ borderColor: "var(--border)" }} />
        Raw tank dip reading only
      </div>
    </MockupFrame>
  );
}
