import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { requireDb } from "@/db";
import { services } from "@/db/schema";
import { getStaff } from "@/lib/staff-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceRowForm } from "@/components/admin/service-row-form";

export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  const current = await getStaff();
  if (!current || (current.role !== "administrator" && current.role !== "superadmin")) notFound();

  let list: Awaited<ReturnType<typeof loadServices>> = [];
  let dbError = false;
  try {
    list = await loadServices();
  } catch {
    dbError = true;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Services</h1>
        <p className="text-sm text-muted-foreground">
          The service catalogue shown to clients on the Request Service page, with optional
          pricing shown on their request form and used to pre-fill the auto-generated invoice
          when Operations approves a job.
        </p>
      </div>

      {dbError ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Database not reachable.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Service Catalogue ({list.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {list.map((s) => (
              <ServiceRowForm
                key={s.id}
                id={s.id}
                label={s.label}
                pricingLabel={s.pricingLabel}
                defaultPriceCents={s.defaultPriceCents}
                active={s.active}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function loadServices() {
  return requireDb().select().from(services).orderBy(asc(services.position));
}
