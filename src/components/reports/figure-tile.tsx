import { cn } from "@/lib/utils";

/**
 * Small labelled readout used across the gauge board and dashboards.
 * Mirrors the StatCard pattern on the portal dashboard but tuned for figures.
 */
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
    <div
      className={cn("rounded-xl border p-4", className)}
      style={{ borderColor: "var(--border)" }}
    >
      <p className="m-0 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-2 font-mono text-xl font-bold tabular-nums text-navy-950">
        {value}
        {unit ? <span className="ml-1 text-xs font-medium text-muted-foreground">{unit}</span> : null}
      </p>
      {sub ? <p className="m-0 mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

const compactFmt = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** Consistent whole-number formatting for volumes / weights. */
export function fmtQty(n: number | null | undefined): string {
  return n == null ? "—" : compactFmt.format(n);
}
