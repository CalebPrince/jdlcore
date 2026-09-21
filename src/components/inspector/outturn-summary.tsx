import Link from "next/link";
import { removeOutturnTankReading } from "@/app/actions/inspector";
import { buildOutturnTrail, sumOutturnTotals, type OutturnHeaderRow, type OutturnTankRow } from "@/lib/outturn-trail";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (n: number | null | undefined, decimals = 3) =>
  n === null || n === undefined ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** The tanks already added to this job's outturn, with a quick figure, Edit and Remove per row. */
export function OutturnTanksList({
  jobId,
  header,
  tankRows,
  tankNames,
  editable,
}: {
  jobId: number;
  header: OutturnHeaderRow;
  tankRows: OutturnTankRow[];
  tankNames: Map<number, string>;
  /** false on the read-only (staff review) view — no Edit/Remove links. */
  editable: boolean;
}) {
  if (tankRows.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">No tanks added yet — use the form below to add the first one.</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tank</TableHead>
          <TableHead>GSV Outturn (L)</TableHead>
          <TableHead>Mt Air Outturn</TableHead>
          {editable && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {tankRows.map((t) => {
          const trail = buildOutturnTrail(header, t);
          const initialName = tankNames.get(t.initialTankId) ?? `Tank #${t.initialTankId}`;
          const finalName = tankNames.get(t.finalTankId) ?? `Tank #${t.finalTankId}`;
          return (
            <TableRow key={t.id}>
              <TableCell className="font-medium text-navy-950">{initialName === finalName ? initialName : `${initialName} → ${finalName}`}</TableCell>
              <TableCell>{trail.blockingErrors.length > 0 ? "—" : fmt(trail.outturn?.volumeOutturnL)}</TableCell>
              <TableCell>{trail.blockingErrors.length > 0 ? "—" : fmt(trail.outturn?.mtAirOutturn)}</TableCell>
              {editable && (
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/inspector/jobs/${jobId}?editOutturnTank=${t.id}#outturn-form`}>Edit</Link>
                    </Button>
                    <form action={removeOutturnTankReading}>
                      <input type="hidden" name="jobId" value={jobId} />
                      <input type="hidden" name="tankRowId" value={t.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Remove
                      </Button>
                    </form>
                  </div>
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Movement type, per-tank outturn, grand total across every tank, and notes — the report's SUMMARY section. */
export function OutturnSummaryCard({
  header,
  tankRows,
  tankNames,
}: {
  header: OutturnHeaderRow;
  tankRows: OutturnTankRow[];
  tankNames: Map<number, string>;
}) {
  const totals = sumOutturnTotals(header, tankRows);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">Summary</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="m-0 text-sm">
          <span className="font-medium text-navy-950">Movement: </span>
          {header.movementType === "receipt" ? "Receipt into tank" : "Delivery / issue from tank"}
        </p>

        {tankRows.length > 1 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tank</TableHead>
                <TableHead>GOV Outturn</TableHead>
                <TableHead>GSV Outturn</TableHead>
                <TableHead>US BBL Outturn</TableHead>
                <TableHead>Mt Vac Outturn</TableHead>
                <TableHead>Mt Air Outturn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tankRows.map((t) => {
                const trail = buildOutturnTrail(header, t);
                const name = tankNames.get(t.initialTankId) ?? `Tank #${t.initialTankId}`;
                return (
                  <TableRow key={t.id}>
                    <TableCell>{name}</TableCell>
                    <TableCell>{fmt(trail.outturn?.govOutturnL)}</TableCell>
                    <TableCell>{fmt(trail.outturn?.volumeOutturnL)}</TableCell>
                    <TableCell>{fmt(trail.outturn?.usBblOutturn)}</TableCell>
                    <TableCell>{fmt(trail.outturn?.mtVacOutturn)}</TableCell>
                    <TableCell>{fmt(trail.outturn?.mtAirOutturn)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="m-0 font-semibold text-navy-950">Grand total ({tankRows.length} tank{tankRows.length === 1 ? "" : "s"})</p>
          <p className="m-0 mt-1 text-muted-foreground">
            GOV {fmt(totals.govOutturnL)} L · GSV {fmt(totals.volumeOutturnL)} L · US BBL {fmt(totals.usBblOutturn)} · Mt Vac{" "}
            {fmt(totals.mtVacOutturn)} · Mt Air {fmt(totals.mtAirOutturn)}
            {header.isCrudeOil && totals.netOutturnL !== null ? ` · Net ${fmt(totals.netOutturnL)} L` : ""}
          </p>
          {totals.incompleteTankCount > 0 && (
            <p className="m-0 mt-1 text-destructive">
              {totals.incompleteTankCount} tank{totals.incompleteTankCount === 1 ? "" : "s"} couldn&apos;t be calculated and{" "}
              {totals.incompleteTankCount === 1 ? "is" : "are"} excluded from this total — check its readings above.
            </p>
          )}
        </div>

        {header.notes && (
          <div>
            <p className="m-0 text-xs font-semibold uppercase text-muted-foreground">Notes</p>
            <p className="m-0 mt-1 text-sm text-ink-soft">{header.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
