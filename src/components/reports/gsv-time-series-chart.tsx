"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { GsvPoint } from "@/lib/reports";

const chartConfig: ChartConfig = {
  gsv: { label: "GSV", color: "#1c4d80" },
  gov: { label: "GOV", color: "#c98e12" },
};

export function GsvTimeSeriesChart({ data }: { data: GsvPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="m-0 py-8 text-center text-sm text-muted-foreground">
        No completed jobs with quantity data in this range yet.
      </p>
    );
  }

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    ref: d.ref,
    gsv: d.gsv,
    gov: d.gov,
  }));

  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
      <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={56} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          type="monotone"
          dataKey="gsv"
          stroke="var(--color-gsv)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-gsv)" }}
        />
        <Line
          type="monotone"
          dataKey="gov"
          stroke="var(--color-gov)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-gov)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}
