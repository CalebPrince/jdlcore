import { redirect } from "next/navigation";
import { getPortalClient } from "@/lib/portal-auth";
import { loadGsvSeries, loadStockSeries, loadTankGauges } from "@/lib/reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReportFilterBar } from "@/components/reports/report-filter-bar";
import { GsvTimeSeriesChart } from "@/components/reports/gsv-time-series-chart";
import { StockMovementChart } from "@/components/reports/stock-movement-chart";
import { TankGaugeCard } from "@/components/reports/tank-gauge";

export const dynamic = "force-dynamic";

export default async function PortalReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceType?: string; from?: string; to?: string }>;
}) {
  const client = await getPortalClient();
  if (!client) redirect("/portal/login");

  const sp = await searchParams;
  const filters = {
    clientId: client.id,
    serviceType: sp.serviceType || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  };

  let gsvData: Awaited<ReturnType<typeof loadGsvSeries>> = [];
  let stockData: Awaited<ReturnType<typeof loadStockSeries>> = [];
  let tankGauges: Awaited<ReturnType<typeof loadTankGauges>> = [];
  let dbError = false;
  try {
    [gsvData, stockData, tankGauges] = await Promise.all([
      loadGsvSeries(filters),
      loadStockSeries(filters),
      loadTankGauges({ clientId: client.id }),
    ]);
  } catch {
    dbError = true;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Your GSV/GOV trends, stock movement, and tank utilization.
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
          <ReportFilterBar basePath="/portal/reports" current={sp} />

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

          <Card>
            <CardHeader>
              <CardTitle className="font-display">Tank Utilization ({tankGauges.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {tankGauges.length === 0 ? (
                <p className="m-0 text-sm text-muted-foreground">No active tanks registered.</p>
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  {tankGauges.map((t) => (
                    <TankGaugeCard key={t.tankId} tank={t} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
