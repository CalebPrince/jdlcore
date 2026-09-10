"use client";

import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { TankTrend } from "@/lib/reports";
import { fmtQty } from "@/components/reports/figure-tile";

const chartConfig: ChartConfig = {
  gsv: { label: "GSV (m³)", color: "#1c4d80" },
};

export function TankTrendGrid({ trends }: { trends: TankTrend[] }) {
  if (trends.length === 0) {
    return (
      <p className="m-0 py-6 text-center text-sm text-muted-foreground">
        No stock readings with GSV in this range yet.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {trends.map((t) => {
        const chartData = t.points.map((p) => ({
          date: new Date(p.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
          gsv: p.gsv,
        }));
        const last = t.points[t.points.length - 1]?.gsv ?? null;
        return (
          <div key={t.tankId} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <p className="m-0 font-display text-sm font-bold text-navy-950">{t.tankName}</p>
              <p className="m-0 font-mono text-xs text-muted-foreground">
                {fmtQty(last)} m³
                {t.change != null && (
                  <span style={{ color: t.change < 0 ? "#c0392b" : "#1f7a4d" }}>
                    {" "}
                    ({t.change >= 0 ? "+" : ""}
                    {fmtQty(t.change)})
                  </span>
                )}
              </p>
            </div>
            <ChartContainer config={chartConfig} className="aspect-auto h-28 w-full">
              <AreaChart data={chartData} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                <Area
                  type="monotone"
                  dataKey="gsv"
                  stroke="var(--color-gsv)"
                  fill="var(--color-gsv)"
                  fillOpacity={0.12}
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        );
      })}
    </div>
  );
}
