import Link from "next/link";
import type { StockReading } from "@/db/schema";
import { RemoveStockReadingButton } from "@/components/inspector/inspector-job-forms";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

const fmt = (v: string | null) =>
  v === null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** The stock readings already logged on this job, with Edit and Remove per row while the job is still open. */
export function StockReadingsList({
  jobId,
  readings,
  totalCount,
  tankNames,
  editable,
  editingReadingId,
}: {
  jobId: number;
  readings: StockReading[];
  totalCount: number;
  tankNames: Map<number, string>;
  /** false once the job is with Operations: no Edit/Remove links. */
  editable: boolean;
  editingReadingId?: number;
}) {
  if (readings.length === 0) {
    return <p className="m-0 text-sm text-muted-foreground">No stock readings logged yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Tank</TableHead>
            <TableHead>Opening</TableHead>
            <TableHead>Closing</TableHead>
            <TableHead>GSV</TableHead>
            {editable && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {readings.map((r) => (
            <TableRow key={r.id} className={r.id === editingReadingId ? "bg-muted/50" : undefined}>
              <TableCell className="font-medium text-navy-950">{dateFmt.format(new Date(r.readingDate))}</TableCell>
              <TableCell>{tankNames.get(r.tankId) ?? `Tank #${r.tankId}`}</TableCell>
              <TableCell>{fmt(r.openingStock)}</TableCell>
              <TableCell>{fmt(r.closingStock)}</TableCell>
              <TableCell>{fmt(r.gsv)}</TableCell>
              {editable && (
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/inspector/jobs/${jobId}?editStockReading=${r.id}#stock-reading-form`}>Edit</Link>
                    </Button>
                    <RemoveStockReadingButton jobId={jobId} readingId={r.id} />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalCount > readings.length && (
        <p className="m-0 text-xs text-muted-foreground">
          Showing the latest {readings.length} of {totalCount} readings.
        </p>
      )}
    </div>
  );
}
