import type { TankGauge } from "@/lib/reports";
import { fmtQty } from "@/components/reports/figure-tile";

const num1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const num4 = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Pipeline line-item — product in transit, not tankage: no gauge, no fill, no height. */
export function PipelineCard({ line }: { line: TankGauge }) {
  const subtitle = `${line.product ?? "Product"} in the sub-sea pipeline, not tankage`;
  const figures: { label: string; value: string }[] = [
    { label: "TEMP", value: line.temperatureC != null ? `${num1.format(line.temperatureC)} °C` : "—" },
    { label: "DENSITY@20", value: line.densityAt20 != null ? num4.format(line.densityAt20) : "—" },
    { label: "VCF", value: line.vcf != null ? num4.format(line.vcf) : "—" },
    { label: "STD. VOL", value: line.gsv != null ? `${fmtQty(line.gsv)} m³` : "—" },
    { label: "NET WT.", value: line.netWeightAir != null ? `${fmtQty(line.netWeightAir)} MT` : "—" },
  ];

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-l-4 p-4"
      style={{ borderColor: "var(--border)", borderLeftColor: "#c98e12" }}
    >
      <div>
        <p className="m-0 font-display text-base font-bold text-navy-950">{line.name}</p>
        <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-3 lg:grid-cols-5">
        {figures.map((f) => (
          <div key={f.label}>
            <dt className="m-0 font-mono uppercase tracking-wide text-muted-foreground">{f.label}</dt>
            <dd className="m-0 mt-0.5 font-mono text-[12px] font-medium tabular-nums text-navy-950">{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
