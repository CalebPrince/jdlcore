import type { TankGauge } from "@/lib/reports";
import { Badge } from "@/components/ui/badge";
import { fmtQty, fmtDelta } from "@/components/reports/figure-tile";

function fillColor(pct: number, belowMinStop: boolean): string {
  if (belowMinStop) return "#b91c1c";
  if (pct < 10) return "#c2410c";
  if (pct < 25) return "#c98e12";
  if (pct >= 90) return "#0f3355";
  return "#1c4d80";
}

const num1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const num4 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
const num5 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 5, maximumFractionDigits: 5 });

/** Storage-tank card — the artifact's dip-gauge reading, in jdlcore styling. */
export function TankGaugeCard({ tank, compact = false }: { tank: TankGauge; compact?: boolean }) {
  const pct = tank.fillPct;
  const color = fillColor(pct ?? 0, tank.belowMinStop);
  const hasReading = tank.readingDate != null;
  const remark = tank.statusRemark?.trim().toUpperCase() || "NO REMARK";

  // SVG: body y=8..120 (112 tall); scale ticks + labels on the right.
  const bodyTop = 8;
  const bodyH = 112;
  const yFor = (frac: number) => bodyTop + bodyH - Math.max(0, Math.min(1, frac)) * bodyH;
  const surfaceY = pct != null ? yFor(pct / 100) : null;
  const minStopFrac =
    tank.minPumpableStop != null && tank.capacity && tank.capacity > 0 ? tank.minPumpableStop / tank.capacity : null;

  const govNet =
    tank.gsv != null || tank.netWeightAir != null ? `${fmtQty(tank.gsv)} m³ / ${fmtQty(tank.netWeightAir)} MT` : "—";
  const pumpLabel = tank.deltaNetWeight != null ? "PUMPABLE STOCK · 24H Δ" : "PUMPABLE STOCK";
  const pumpValue =
    tank.pumpableStock == null && tank.deltaNetWeight == null
      ? "—"
      : `${tank.pumpableStock != null ? `${fmtQty(tank.pumpableStock)} MT` : "—"}${
          tank.deltaNetWeight != null ? ` · ${fmtDelta(tank.deltaNetWeight)} MT` : ""
        }`;

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{ borderColor: tank.belowMinStop ? "rgba(185,28,28,0.45)" : "var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 truncate font-display text-base font-bold text-navy-950">{tank.name}</p>
          <p className="m-0 mt-0.5 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{remark}</p>
        </div>
        {tank.belowMinStop && (
          <Badge variant="destructive" className="shrink-0 uppercase">
            Below min-stop
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-4">
        <svg
          viewBox="0 0 76 128"
          width={compact ? 62 : 74}
          height={compact ? 104 : 124}
          role="img"
          aria-label={pct != null ? `${num1.format(pct)} percent full` : "no reading"}
        >
          <rect x="6" y={bodyTop} width="42" height={bodyH} rx="9" fill="var(--muted, #f1f1ef)" stroke="#c7d2d9" strokeWidth="2" />
          {surfaceY != null && (
            <>
              <rect x="8" y={surfaceY} width="38" height={bodyTop + bodyH - surfaceY} rx="5" fill={color} opacity="0.85" />
              <line x1="6" x2="48" y1={surfaceY} y2={surfaceY} stroke={color} strokeWidth="1.5" />
              <circle cx="27" cy={surfaceY} r="2.6" fill="#fff" stroke={color} strokeWidth="1.6" />
            </>
          )}
          {minStopFrac != null && (
            <line x1="4" x2="50" y1={yFor(minStopFrac)} y2={yFor(minStopFrac)} stroke="#b91c1c" strokeWidth="1.5" strokeDasharray="3 2" />
          )}
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1="48" x2="51" y1={yFor(t / 100)} y2={yFor(t / 100)} stroke="#9aa7ae" strokeWidth="1" />
              <text x="53" y={yFor(t / 100) + 2.6} fontSize="7" fill="#9aa7ae" fontFamily="var(--font-mono, monospace)">
                {t}
              </text>
            </g>
          ))}
        </svg>

        <div className="flex-1">
          <p className="m-0 font-mono text-3xl font-bold leading-none tabular-nums" style={{ color }}>
            {pct != null ? `${num1.format(pct)}%` : "—"}
          </p>
          <p className="m-0 mt-1.5 font-mono text-[11px] text-muted-foreground">
            {hasReading ? "of max gauge height" : "No reading"}
          </p>
        </div>
      </div>

      {hasReading && (
        <dl
          className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t pt-2.5 text-[11px]"
          style={{ borderColor: "var(--border)" }}
        >
          <Cell label="HEIGHT" value={tank.dipHeightMm != null ? `${fmtQty(tank.dipHeightMm)} mm` : "—"} />
          <Cell label="TEMP" value={tank.temperatureC != null ? `${num1.format(tank.temperatureC)} °C` : "—"} />
          <Cell label="DENSITY@20" value={tank.densityAt20 != null ? num4.format(tank.densityAt20) : "—"} />
          <Cell label="VCF" value={tank.vcf != null ? num5.format(tank.vcf) : "—"} />
          <Cell label="GROSS STD. VOL. / NET WT." value={govNet} span />
          <Cell label={pumpLabel} value={pumpValue} span />
        </dl>
      )}
    </div>
  );
}

function Cell({ label, value, span = false }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? "col-span-2" : undefined}>
      <dt className="m-0 font-mono uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="m-0 mt-0.5 font-mono text-[12px] font-medium tabular-nums text-navy-950">{value}</dd>
    </div>
  );
}
