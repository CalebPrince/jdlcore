import { cn } from "@/lib/utils";

/** Summary readout — grey caps label, large value, small unit, optional sub-line (e.g. "@20°C"). */
export function FigureTile({
  label,
  value,
  unit,
  sub,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-3", className)}>
      <p className="m-0 font-mono text-[0.68rem] font-semibold uppercase leading-tight tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-2.5 font-display text-2xl font-bold leading-none tabular-nums text-navy-950">
        {value}
        {unit ? <span className="ml-1 font-mono text-xs font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      {sub ? <p className="m-0 mt-1.5 font-mono text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

const qtyFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** Whole-number volume / weight with thousands separators — "46,103". */
export function fmtQty(n: number | null | undefined): string {
  return n == null ? "—" : qtyFmt.format(Math.round(n));
}

/** Signed delta using a true minus sign — "−3,294" / "+512". */
export function fmtDelta(n: number | null | undefined): string {
  if (n == null) return "—";
  const r = Math.round(n);
  return `${r < 0 ? "−" : "+"}${qtyFmt.format(Math.abs(r))}`;
}
