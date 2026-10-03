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

/** Refinery and petroleum storage depot, drawn in code, with the tank calculation readouts. */
function DepotVector() {
  const tanks = [
    { x: 128, level: 0.78, tag: "T-01" },
    { x: 168, level: 0.55, tag: "T-02" },
    { x: 208, level: 0.4, tag: "T-03" },
  ];
  return (
    <svg
      viewBox="0 0 340 128"
      role="presentation"
      className="w-full rounded-[var(--radius-sm)] bg-paper-deep"
    >
      {/* ground */}
      <line x1="0" y1="112" x2="340" y2="112" className="stroke-navy-950" strokeWidth="1.5" />

      {/* refinery: columns, furnace, pipe rack, flare */}
      <g className="fill-navy-800">
        <rect x="14" y="30" width="16" height="82" rx="3" />
        <rect x="38" y="48" width="14" height="64" rx="3" />
        <rect x="60" y="84" width="30" height="28" rx="2" />
      </g>
      <g className="stroke-navy-950" strokeWidth="1.5" fill="none">
        <path d="M30 60 H38 M52 72 H98 M22 30 V22 M45 48 V40" />
        <path d="M75 84 V70" />
      </g>
      <g className="fill-navy-950">
        <rect x="96" y="26" width="3" height="86" />
      </g>
      <path
        d="M97.5 8 C103 14 104 18 100.5 24 C99 21 98 22 97.5 24 C94 19 95 14 97.5 8 Z"
        className="fill-gold-500"
      />

      {/* storage tanks with liquid level */}
      {tanks.map((t) => {
        const h = 44;
        const top = 68;
        const fill = h * t.level;
        return (
          <g key={t.tag}>
            <rect x={t.x} y={top} width="30" height={h} className="fill-white stroke-navy-950" strokeWidth="1.5" />
            <rect x={t.x} y={top + h - fill} width="30" height={fill} className="fill-gold-500" opacity="0.85" />
            <path d={`M${t.x} ${top} Q${t.x + 15} ${top - 12} ${t.x + 30} ${top}`} className="fill-navy-100 stroke-navy-950" strokeWidth="1.5" />
            <text x={t.x + 15} y={top + h + 11} textAnchor="middle" className="fill-ink-soft" fontSize="7" fontWeight="700">
              {t.tag}
            </text>
          </g>
        );
      })}

      {/* calculation callout */}
      <path d="M158 68 Q158 40 246 40" className="stroke-gold-600" strokeWidth="1" strokeDasharray="3 2" fill="none" />
      <rect x="246" y="22" width="88" height="62" rx="4" className="fill-navy-950" />
      <g fontSize="8" className="fill-paper">
        <text x="254" y="37" className="fill-gold-300" fontWeight="700" fontSize="7">
          T-02 CALCULATION
        </text>
        <text x="254" y="52">GSV 1.20M L</text>
        <text x="254" y="65">Net 1,031 MT</text>
        <text x="254" y="78">Temp 27.4°C</text>
      </g>
    </svg>
  );
}

/** Weekly verified quantity (bars) with the stock variance trend (line). Sample data. */
function StockChart() {
  const weeks = ["W1", "W2", "W3", "W4", "W5", "W6"];
  const qty = [620, 740, 690, 880, 960, 1031]; // MT
  const variance = [1.4, 1.2, 1.1, 0.9, 0.7, 0.6]; // %
  const base = 74;
  const barW = 22;
  const gap = 14;
  const x0 = 28;
  const maxQty = 1100;
  const bars = qty.map((q, i) => ({
    x: x0 + i * (barW + gap),
    h: (q / maxQty) * 58,
  }));
  const line = variance
    .map((v, i) => {
      const x = x0 + i * (barW + gap) + barW / 2;
      const y = base - ((v - 0.4) / 1.2) * 52 - 6;
      return `${i === 0 ? "M" : "L"}${x} ${y}`;
    })
    .join(" ");
  return (
    <div className="rounded-[var(--radius-sm)] border px-3 pt-2.5 pb-1.5" style={{ borderColor: "var(--border)" }}>
      <div className="mb-1 flex items-center justify-between text-[0.68rem] uppercase tracking-[0.05em] text-ink-faint">
        <span>Verified quantity (MT)</span>
        <span className="flex items-center gap-1 normal-case tracking-normal">
          <span className="h-0.5 w-3 bg-navy-950" /> Variance %
        </span>
      </div>
      <svg viewBox="0 0 280 92" role="presentation" className="w-full">
        {[0, 1, 2].map((g) => (
          <line key={g} x1="20" x2="276" y1={base - g * 26} y2={base - g * 26} className="stroke-navy-100" strokeWidth="1" />
        ))}
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={base - b.h} width={barW} height={b.h} rx="2" className="fill-gold-500" />
        ))}
        <path d={line} fill="none" className="stroke-navy-950" strokeWidth="1.8" strokeLinejoin="round" />
        {variance.map((_, i) => {
          const x = x0 + i * (barW + gap) + barW / 2;
          const y = base - ((variance[i] - 0.4) / 1.2) * 52 - 6;
          return <circle key={i} cx={x} cy={y} r="2.4" className="fill-navy-950" />;
        })}
        {weeks.map((w, i) => (
          <text key={w} x={x0 + i * (barW + gap) + barW / 2} y="88" textAnchor="middle" fontSize="7.5" className="fill-ink-faint">
            {w}
          </text>
        ))}
        <text x="276" y="12" textAnchor="end" fontSize="8" fontWeight="700" className="fill-[#1f7a4d]">
          1.4% to 0.6%
        </text>
      </svg>
    </div>
  );
}

export function OverviewMockup() {
  return (
    <MockupFrame url="overview.jdlcore.com">
      <p className="m-0 font-display text-[0.95rem] font-bold leading-snug text-navy-950">
        Independent Oil and Gas Inspection, Collateral Management, Analytics &amp; Training
      </p>
      <DepotVector />
      <StockChart />
      <div className="flex gap-2.5">
        <Stat num="Live" lbl="Inspection" />
        <Stat num="Closed" lbl="Analytics" />
        <Stat num="Closed" lbl="Academy" />
      </div>
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
