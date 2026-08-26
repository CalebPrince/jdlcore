import { notFound } from "next/navigation";
import { asc, desc } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, tanks } from "@/db/schema";
import { getStaff } from "@/lib/staff-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleTankActive } from "@/app/actions/tanks-admin";
import { CreateTankForm } from "@/components/admin/tank-forms";

export const dynamic = "force-dynamic";

export default async function AdminTanksPage() {
  const current = await getStaff();
  if (!current || (current.role !== "administrator" && current.role !== "superadmin")) notFound();

  let tankList: Awaited<ReturnType<typeof loadTanks>> = [];
  let clientList: Awaited<ReturnType<typeof loadClients>> = [];
  let dbError = false;
  try {
    [tankList, clientList] = await Promise.all([loadTanks(), loadClients()]);
  } catch {
    dbError = true;
  }

  const clientName = new Map(clientList.map((c) => [c.id, c.company ? `${c.name} — ${c.company}` : c.name]));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Tanks</h1>
        <p className="text-sm text-muted-foreground">
          Tank reference data used for Stock Monitoring jobs and the stock/tank reports.
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
          <CreateTankForm clients={clientList} />
          <Card>
            <CardHeader>
              <CardTitle className="font-display">Tank Register ({tankList.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {tankList.length === 0 && (
                <p className="m-0 text-sm text-muted-foreground">No tanks registered yet.</p>
              )}
              {tankList.map((t) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border p-4"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="min-w-[220px] flex-1">
                    <p className="m-0 text-sm font-semibold text-navy-950">{t.name}</p>
                    <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                      {clientName.get(t.clientId) ?? "Unknown client"}
                      {t.product ? ` · ${t.product}` : ""}
                      {t.depot ? ` · ${t.depot}` : ""}
                      {t.capacity ? ` · ${Number(t.capacity).toLocaleString()} ${t.capacityUnit}` : ""}
                    </p>
                  </div>
                  <Badge variant={t.active ? "secondary" : "outline"}>
                    {t.active ? "Active" : "Inactive"}
                  </Badge>
                  <form action={toggleTankActive}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="active" value={t.active ? "false" : "true"} />
                    <Button type="submit" variant="ghost" size="sm">
                      {t.active ? "Deactivate" : "Activate"}
                    </Button>
                  </form>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

async function loadTanks() {
  return requireDb().select().from(tanks).orderBy(desc(tanks.createdAt));
}

async function loadClients() {
  return requireDb()
    .select({ id: clients.id, name: clients.name, company: clients.company })
    .from(clients)
    .orderBy(asc(clients.name));
}
