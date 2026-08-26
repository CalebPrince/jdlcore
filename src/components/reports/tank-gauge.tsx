import type { TankGauge } from "@/lib/reports";

function levelColor(pct: number): string {
  if (pct >= 90) return "#c0392b";
  if (pct >= 70) return "#c98e12";
  return "#1c4d80";
}

export function TankGaugeCard({ tank }: { tank: TankGauge }) {
  const pct = tank.utilizationPct ?? 0;
  const fillHeight = (pct / 100) * 84;
  const color = levelColor(pct);

  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border p-4 text-center"
      style={{ borderColor: "var(--border)" }}
    >
      <svg viewBox="0 0 60 100" width="52" height="88" aria-hidden="true">
        <rect x="4" y="4" width="52" height="92" rx="6" fill="none" stroke="#c7d2d9" strokeWidth="2" />
        {tank.utilizationPct != null && (
          <rect
            x="6"
            y={94 - fillHeight}
            width="48"
            height={fillHeight}
            rx="3"
            fill={color}
            opacity="0.85"
          />
        )}
      </svg>
      <div>
        <p className="m-0 text-sm font-semibold text-navy-950">{tank.name}</p>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          {tank.clientName}
          {tank.product ? ` · ${tank.product}` : ""}
        </p>
        <p className="m-0 mt-2 font-mono text-lg font-bold" style={{ color }}>
          {tank.utilizationPct != null ? `${tank.utilizationPct}%` : "—"}
        </p>
        <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">
          {tank.latestClosing != null
            ? `${tank.latestClosing.toLocaleString()} / ${tank.capacity?.toLocaleString() ?? "?"} ${tank.capacityUnit}`
            : "No readings yet"}
        </p>
      </div>
    </div>
  );
}
