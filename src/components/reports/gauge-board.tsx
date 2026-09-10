import type { DepotBoard } from "@/lib/reports";
import { FigureTile, fmtQty } from "@/components/reports/figure-tile";
import { TankGaugeCard } from "@/components/reports/tank-gauge";

const stampFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });

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
    <div className="flex flex-col gap-8">
      {shown.map((board) => (
        <section key={board.depot ?? "unassigned"} className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="m-0 font-display text-base font-bold text-navy-950">
              {board.depot ?? "Unassigned depot"}
              {board.clientName ? (
                <span className="ml-2 text-xs font-medium text-muted-foreground">{board.clientName}</span>
              ) : null}
            </h3>
            {board.asOf ? (
              <span className="font-mono text-xs text-muted-foreground">
                as of {stampFmt.format(new Date(board.asOf))}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <FigureTile label="Gross Std Vol" value={fmtQty(board.totals.gsv)} unit="m³" />
            <FigureTile label="Net Weight (air)" value={fmtQty(board.totals.netWeightAir)} unit="MT" />
            <FigureTile label="Pumpable Stock" value={fmtQty(board.totals.pumpableStock)} unit="MT" />
            <FigureTile
              label="In Service"
              value={String(board.totals.inServiceCount)}
              unit={board.totals.inServiceCount === 1 ? "tank" : "tanks"}
              sub={board.totals.pipelineCount > 0 ? `+ ${board.totals.pipelineCount} pipeline` : undefined}
            />
          </div>

          {board.tanks.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {board.tanks.map((t) => (
                <TankGaugeCard key={t.tankId} tank={t} compact={compact} />
              ))}
            </div>
          )}

          {board.pipelines.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {board.pipelines.map((p) => (
                <TankGaugeCard key={p.tankId} tank={p} compact={compact} />
              ))}
            </div>
          )}

          {board.missingDays.length > 0 && (
            <p className="m-0 text-xs text-muted-foreground">
              No readings recorded on{" "}
              {board.missingDays
                .map((d) => dayFmt.format(new Date(d)))
                .join(", ")}
              {" "}— those days are omitted from the trend.
            </p>
          )}
        </section>
      ))}

      {limit && depots.length > limit ? (
        <p className="m-0 text-xs text-muted-foreground">
          Showing {limit} of {depots.length} depots.
        </p>
      ) : null}
    </div>
  );
}
