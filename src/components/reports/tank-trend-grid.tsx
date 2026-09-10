"use client";

import { Area, AreaChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { TankTrend } from "@/lib/reports";
import { fmtQty, fmtDelta } from "@/components/reports/figure-tile";

const chartConfig: ChartConfig = { gsv: { label: "GSV (m³)", color: "#1c4d80" } };

const dotColors = ["#1c4d80", "#c98e12", "#1f7a4d", "#b45309", "#7c3aed", "#0f766e"];
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const axisDay = (d: string) => {
  const dt = new Date(d);
  return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]}`;
};
const fullDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const yTick = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** Round up to a clean axis maximum (1/2/2.5/5 × 10^k). */
function niceCeil(n: number): number {
  if (n <= 0) return 0;
  const mag = 10 ** Math.floor(Math.log10(n));
  const f = n / mag;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * mag;
}

export function TankTrendGrid({ trends }: { trends: TankTrend[] }) {
  if (trends.length === 0) {
    return (
      <p className="m-0 py-6 text-center text-sm text-muted-foreground">
        No stock readings with GSV in this range yet.
      </p>
    );
  }

  const allDates = trends.flatMap((t) => t.points.map((p) => p.date)).sort();
  const from = allDates[0];
  const to = allDates[allDates.length - 1];

  return (
    <div className="flex flex-col gap-4">
      {from && to && (
        <p className="m-0 text-xs text-muted-foreground">
          Daily GSV @20°C, {fullDate(from)} – {fullDate(to)}, one panel per tank. Dates with no reading are omitted
          and consecutive readings joined directly.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trends.map((t, ti) => {
          const dot = dotColors[ti % dotColors.length];
          const chartData = t.points.map((p, i) => ({
            date: p.date,
            gsv: p.gsv,
            endLabel: i === t.points.length - 1 ? fmtQty(p.gsv) : null,
          }));
          const hi = niceCeil(Math.max(...t.points.map((p) => p.gsv)));
          const mid = hi / 2;
          const ticks = from && to ? [t.points[0].date, t.points[t.points.length - 1].date] : undefined;

          return (
            <div key={t.tankId} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <p className="m-0 flex items-center gap-1.5 font-display text-sm font-bold text-navy-950">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />
                  {t.tankName}
                </p>
                {t.change != null && (
                  <p
                    className="m-0 font-mono text-xs font-semibold tabular-nums"
                    style={{ color: t.change < 0 ? "#b91c1c" : "#1f7a4d" }}
                  >
                    {fmtDelta(t.change)} m³
                  </p>
                )}
              </div>
              <ChartContainer config={chartConfig} className="aspect-auto h-36 w-full">
                <AreaChart data={chartData} margin={{ left: 6, right: 40, top: 10, bottom: 2 }}>
                  <CartesianGrid vertical={false} strokeDasharray="2 3" />
                  <XAxis
                    dataKey="date"
                    ticks={ticks}
                    tickFormatter={axisDay}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, hi]}
                    ticks={[0, mid, hi]}
                    tickFormatter={(v: number) => yTick.format(v)}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tick={{ fontSize: 10 }}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent indicator="line" labelFormatter={(l) => axisDay(String(l))} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="gsv"
                    stroke={dot}
                    fill={dot}
                    fillOpacity={0.1}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  >
                    <LabelList dataKey="endLabel" position="right" offset={7} className="fill-navy-950" fontSize={10} />
                  </Area>
                </AreaChart>
              </ChartContainer>
            </div>
          );
        })}
      </div>
    </div>
  );
}
