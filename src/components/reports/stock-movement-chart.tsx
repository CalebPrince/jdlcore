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
import type { StockPoint } from "@/lib/reports";

const chartConfig: ChartConfig = {
  closing: { label: "Closing Stock", color: "#1c4d80" },
  opening: { label: "Opening Stock", color: "#c98e12" },
};

export function StockMovementChart({ data }: { data: StockPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="m-0 py-8 text-center text-sm text-muted-foreground">
        No stock readings logged in this range yet.
      </p>
    );
  }

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    tank: d.tankName,
    opening: d.opening,
    closing: d.closing,
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
          dataKey="closing"
          stroke="var(--color-closing)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-closing)" }}
        />
        <Line
          type="monotone"
          dataKey="opening"
          stroke="var(--color-opening)"
          strokeWidth={2}
          strokeDasharray="4 3"
          dot={{ r: 3, fill: "var(--color-opening)" }}
        />
      </LineChart>
    </ChartContainer>
  );
}
