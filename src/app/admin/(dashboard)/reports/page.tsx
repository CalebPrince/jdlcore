import { redirect } from "next/navigation";
import { getStaff } from "@/lib/staff-auth";
import {
  loadClientOptions,
  loadGaugeBoard,
  loadGsvSeries,
  loadInspectorOptions,
  loadStockSeries,
  loadTankFilterOptions,
  loadTankTrendSeries,
} from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { GsvTimeSeriesChart } from "@/components/reports/gsv-time-series-chart";
import { StockMovementChart } from "@/components/reports/stock-movement-chart";
import { GaugeBoard } from "@/components/reports/gauge-board";
import { TankTrendGrid } from "@/components/reports/tank-trend-grid";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    clientId?: string;
    inspectorId?: string;
    serviceType?: string;
    product?: string;
    depot?: string;
    tankId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const staff = await getStaff();
  if (!staff) redirect("/admin/login");

  const sp = await searchParams;
  const filters = {
    clientId: sp.clientId ? Number(sp.clientId) : undefined,
    inspectorId: sp.inspectorId ? Number(sp.inspectorId) : undefined,
    serviceType: sp.serviceType || undefined,
    product: sp.product || undefined,
    depot: sp.depot || undefined,
    tankId: sp.tankId ? Number(sp.tankId) : undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  };

  let gsvData: Awaited<ReturnType<typeof loadGsvSeries>> = [];
  let stockData: Awaited<ReturnType<typeof loadStockSeries>> = [];
  let board: Awaited<ReturnType<typeof loadGaugeBoard>> = [];
  let trends: Awaited<ReturnType<typeof loadTankTrendSeries>> = [];
  let clientOptions: Awaited<ReturnType<typeof loadClientOptions>> = [];
  let inspectorOptions: Awaited<ReturnType<typeof loadInspectorOptions>> = [];
  let tankOptions: Awaited<ReturnType<typeof loadTankFilterOptions>> = { products: [], depots: [], tanks: [] };
  let dbError = false;
  try {
    [gsvData, stockData, board, trends, clientOptions, inspectorOptions, tankOptions] = await Promise.all([
      loadGsvSeries(filters),
      loadStockSeries(filters),
      loadGaugeBoard(filters),
      loadTankTrendSeries(filters),
      loadClientOptions(),
      loadInspectorOptions(),
      loadTankFilterOptions(filters.clientId),
    ]);
  } catch {
    dbError = true;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Inventory monitoring gauge boards, GSV/GOV trends from completed jobs, and stock movement across all clients.
        </p>
      </div>

      {dbError ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Database not reachable.
          </CardContent>
        </Card>
      ) : (
        <>
          <ReportFilterBar
            basePath="/admin/reports"
            current={sp}
            clients={clientOptions}
            inspectors={inspectorOptions}
            products={tankOptions.products}
            depots={tankOptions.depots}
            tanks={tankOptions.tanks}
          />

          <GaugeBoard depots={board} />

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Gross Standard Volume — 32-Day Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <TankTrendGrid trends={trends} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">GSV / GOV Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <GsvTimeSeriesChart data={gsvData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Stock Movement</CardTitle>
            </CardHeader>
            <CardContent>
              <StockMovementChart data={stockData} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
