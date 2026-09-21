import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { tankCalibrationPoints, tanks } from "@/db/schema";
import { getStaff } from "@/lib/staff-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toggleFloatingRoof } from "@/app/actions/tanks-admin";
import {
  AddCalibrationPointForm,
  CalibrationPasteImport,
  CalibrationPointsTable,
} from "@/components/admin/tank-calibration-forms";

export const dynamic = "force-dynamic";

export default async function TankCalibrationPage({ params }: { params: Promise<{ id: string }> }) {
  const current = await getStaff();
  if (!current || (current.role !== "administrator" && current.role !== "superadmin")) notFound();

  const { id } = await params;
  const tankId = Number(id);
  if (!Number.isInteger(tankId) || tankId <= 0) notFound();

  const database = requireDb();
  const tankRows = await database.select().from(tanks).where(eq(tanks.id, tankId)).limit(1);
  const tank = tankRows[0];
  if (!tank) notFound();

  const points = await database
    .select()
    .from(tankCalibrationPoints)
    .where(eq(tankCalibrationPoints.tankId, tankId))
    .orderBy(asc(tankCalibrationPoints.dipMm));

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
            <Link href="/admin/tanks">&larr; Tanks</Link>
          </Button>
          <h1 className="font-display text-2xl font-bold text-navy-950">{tank.name} — Calibration</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The dip-to-volume strapping table used to calculate GOV from a dip reading. Inspectors never enter TGV by hand
            once a tank is calibrated here — it&apos;s interpolated from these points.
          </p>
        </div>
        <form action={toggleFloatingRoof}>
          <input type="hidden" name="id" value={tank.id} />
          <input type="hidden" name="hasFloatingRoof" value={tank.hasFloatingRoof ? "false" : "true"} />
          <Button type="submit" variant="outline" size="sm">
            {tank.hasFloatingRoof ? "Has a floating roof — remove" : "Mark as having a floating roof"}
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <AddCalibrationPointForm tankId={tank.id} hasFloatingRoof={tank.hasFloatingRoof} />
        <CalibrationPasteImport tankId={tank.id} hasFloatingRoof={tank.hasFloatingRoof} />
      </div>

      <CalibrationPointsTable
        tankId={tank.id}
        hasFloatingRoof={tank.hasFloatingRoof}
        points={points.map((p) => ({
          id: p.id,
          dipMm: p.dipMm,
          volumeLitres: p.volumeLitres,
          roofCorrectionLitres: p.roofCorrectionLitres,
        }))}
      />

      {!tank.hasFloatingRoof && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            This tank isn&apos;t marked as having a floating roof, so roof correction isn&apos;t collected here and Roof
            Volume is always 0 in outturn calculations for it.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
