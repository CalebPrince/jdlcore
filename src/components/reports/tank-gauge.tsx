import type { TankGauge } from "@/lib/reports";
import { Badge } from "@/components/ui/badge";
import { fmtQty } from "@/components/reports/figure-tile";

function fillColor(pct: number, belowMinStop: boolean): string {
  if (belowMinStop) return "#c0392b";
  if (pct >= 90) return "#b45309";
  if (pct >= 70) return "#c98e12";
  return "#1c4d80";
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const num1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const num4 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 5 });
const density4 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Vertical tank fill gauge + latest gauging figures — matches the gauge-board reference. */
export function TankGaugeCard({ tank, compact = false }: { tank: TankGauge; compact?: boolean }) {
  const pct = tank.fillPct;
  const color = fillColor(pct ?? 0, tank.belowMinStop);
  const hasReading = tank.readingDate != null;

  // SVG geometry: gauge body spans y=6..96 (90 units tall).
  const bodyTop = 6;
  const bodyH = 90;
  const fillH = pct != null ? (pct / 100) * bodyH : 0;
  const minStopY =
    tank.minPumpableStop != null && tank.capacity && tank.capacity > 0
      ? bodyTop + bodyH - (Math.min(1, tank.minPumpableStop / tank.capacity)) * bodyH
      : null;

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{ borderColor: tank.belowMinStop ? "rgba(192,57,43,0.4)" : "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 truncate font-display text-sm font-bold text-navy-950">{tank.name}</p>
          <p className="m-0 mt-0.5 truncate text-[11px] text-muted-foreground">
            {tank.product ?? "—"}
            {tank.readingDate ? ` · ${dateFmt.format(new Date(tank.readingDate))}` : ""}
          </p>
        </div>
        {tank.belowMinStop ? (
          <Badge variant="destructive" className="shrink-0 uppercase">
            Below min-stop
          </Badge>
        ) : tank.statusRemark ? (
          <Badge variant="outline" className="shrink-0 uppercase">
            {tank.statusRemark}
          </Badge>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <svg viewBox="0 0 56 102" width={compact ? 44 : 54} height={compact ? 80 : 96} aria-hidden="true">
          <rect
            x="6"
            y={bodyTop}
            width="44"
            height={bodyH}
            rx="8"
            fill="var(--muted, #f1f1ef)"
            stroke="#c7d2d9"
            strokeWidth="2"
          />
          {pct != null && (
            <rect
              x="8"
              y={bodyTop + bodyH - fillH}
              width="40"
              height={fillH}
              rx="4"
              fill={color}
              opacity="0.85"
            />
          )}
          {minStopY != null && (
            <line
              x1="4"
              x2="52"
              y1={minStopY}
              y2={minStopY}
              stroke="#c0392b"
              strokeWidth="1.5"
              strokeDasharray="3 2"
            />
          )}
        </svg>

        <div className="flex-1">
          <p className="m-0 font-mono text-2xl font-bold leading-none" style={{ color }}>
            {pct != null ? `${num1.format(pct)}%` : "—"}
          </p>
          <p className="m-0 mt-1 text-[11px] text-muted-foreground">
            {hasReading
              ? `${fmtQty(tank.gsv)} m³ · ${fmtQty(tank.netWeightAir)} MT`
              : "No readings yet"}
          </p>
          {tank.deltaNetWeight != null && (
            <p
              className="m-0 mt-0.5 font-mono text-[11px] font-semibold"
              style={{ color: tank.deltaNetWeight < 0 ? "#c0392b" : "#1f7a4d" }}
            >
              {tank.deltaNetWeight >= 0 ? "+" : ""}
              {fmtQty(tank.deltaNetWeight)} MT
            </p>
          )}
        </div>
      </div>

      {hasReading && !compact && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t pt-2 text-[11px]" style={{ borderColor: "var(--border)" }}>
          <Row label="Height" value={tank.dipHeightMm != null ? `${fmtQty(tank.dipHeightMm)} mm` : "—"} />
          <Row label="Temp" value={tank.temperatureC != null ? `${num1.format(tank.temperatureC)} °C` : "—"} />
          <Row label="Density@20" value={tank.densityAt20 != null ? density4.format(tank.densityAt20) : "—"} />
          <Row label="VCF" value={tank.vcf != null ? num4.format(tank.vcf) : "—"} />
          <Row label="Pumpable" value={tank.pumpableStock != null ? `${fmtQty(tank.pumpableStock)} MT` : "—"} />
          <Row
            label="Capacity"
            value={tank.capacity != null ? `${fmtQty(tank.capacity)} ${tank.capacityUnit}` : "—"}
          />
        </dl>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="m-0 font-mono font-medium text-navy-950">{value}</dd>
    </div>
  );
}
