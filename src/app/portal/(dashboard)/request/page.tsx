import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requireDb } from "@/db";
import { services } from "@/db/schema";
import { RequestServiceForm } from "@/components/portal/request-service-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function RequestServicePage() {
  const serviceList = await requireDb()
    .select()
    .from(services)
    .where(eq(services.active, true))
    .orderBy(asc(services.position));

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/portal"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold-600"
      >
        <ArrowLeft className="h-4 w-4" /> My Jobs
      </Link>

      <div>
        <h1 className="font-display text-[1.6rem] font-bold text-navy-950">Request a Service</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell us what you need and we&apos;ll assign an inspector. A reference number is generated automatically.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">New Request</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestServiceForm
            services={serviceList.map((s) => ({ key: s.key, label: s.label, pricingLabel: s.pricingLabel }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
