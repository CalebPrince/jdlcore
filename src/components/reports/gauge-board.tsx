import type { DepotBoard } from "@/lib/reports";
import { Card, CardContent } from "@/components/ui/card";
import { FigureTile, fmtQty } from "@/components/reports/figure-tile";
import { TankGaugeCard } from "@/components/reports/tank-gauge";
import { PipelineCard } from "@/components/reports/pipeline-card";

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
const longDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" });

function inServiceUnit(tanks: number, pipelines: number): string {
  const t = tanks === 1 ? "tank" : "tanks";
  if (pipelines === 0) return t;
  if (pipelines === 1) return `${t} + SPM line`;
  return `${t} + ${pipelines} pipelines`;
}

export function GaugeBoard({
  depots,
  compact = false,
  limit,
}: {
  depots: DepotBoard[];
  compact?: boolean;
  limit?: number;
}) {
  if (depots.length === 0) {
    return (
      <p className="m-0 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        No tanks registered for stock monitoring yet.
      </p>
    );
  }

  const shown = limit ? depots.slice(0, limit) : depots;

  return (
    <div className="flex flex-col gap-6">
      {shown.map((board) => (
        <Card key={board.depot ?? "unassigned"}>
          <CardContent className="flex flex-col gap-5">
            {/* Header */}
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b pb-4" style={{ borderColor: "var(--border)" }}>
              <div>
                <p className="m-0 font-mono text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {(board.clientName ?? "Client") + " · TANKS DAILY SITUATION"}
                </p>
                <h3 className="m-0 mt-1 font-display text-xl font-bold text-navy-950">
                  {board.depot ?? "Unassigned depot"}
                </h3>
              </div>
              {board.asOf && (
                <div className="text-right">
                  <p className="m-0 font-mono text-2xl font-bold leading-none tracking-tight text-navy-950">
                    {timeFmt.format(new Date(board.asOf))}
                  </p>
                  <p className="m-0 mt-1 font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                    {longDate.format(new Date(board.asOf))}
                  </p>
                </div>
              )}
            </div>

            {/* Summary tiles */}
            <div className="grid grid-cols-2 divide-x divide-y rounded-xl border sm:grid-cols-4 sm:divide-y-0" style={{ borderColor: "var(--border)" }}>
              <FigureTile label="Gross Standard Vol." value={fmtQty(board.totals.gsv)} unit="m³" sub="@20°C" />
              <FigureTile label="Net Weight (Air)" value={fmtQty(board.totals.netWeightAir)} unit="MT" />
              <FigureTile label="Pumpable Stock" value={fmtQty(board.totals.pumpableStock)} unit="MT" />
              <FigureTile
                label="In Service"
                value={String(board.totals.inServiceCount)}
                unit={inServiceUnit(board.totals.inServiceCount, board.totals.pipelineCount)}
              />
            </div>

            {/* Storage tanks */}
            {board.tanks.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="m-0 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-navy-950">
                  Storage Tanks — Dip Gauge Reading
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {board.tanks.map((t) => (
                    <TankGaugeCard key={t.tankId} tank={t} compact={compact} />
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline */}
            {board.pipelines.length > 0 && (
              <div className="grid grid-cols-1 gap-3">
                {board.pipelines.map((p) => (
                  <PipelineCard key={p.tankId} line={p} />
                ))}
              </div>
            )}

            {/* Notes / footer */}
            <div className="flex flex-col gap-1 border-t pt-3 text-[11px] text-muted-foreground" style={{ borderColor: "var(--border)" }}>
              {board.missingDays.length > 0 && (
                <p className="m-0">
                  No readings recorded on {board.missingDays.map((d) => dayFmt.format(new Date(d))).join(", ")} — those
                  dates are omitted and consecutive readings joined directly.
                </p>
              )}
              <p className="m-0">
                Dashed line marks each tank&apos;s minimum pumpable stop. Fill % is read off dip height ÷{" "}
                {board.maxGaugeHeightMm != null ? `${fmtQty(board.maxGaugeHeightMm)} mm` : "each tank's"} max gauge stop.
              </p>
              {board.sourceLabel && (
                <p className="m-0">
                  <span className="font-semibold text-navy-950">Source:</span> {board.sourceLabel}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      {limit && depots.length > limit && (
        <p className="m-0 text-xs text-muted-foreground">Showing {limit} of {depots.length} depots.</p>
      )}
    </div>
  );
}
