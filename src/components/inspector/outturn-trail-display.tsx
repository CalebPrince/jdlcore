import { TriangleAlert } from "lucide-react";
import type { OutturnTrail } from "@/lib/outturn-trail";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const fmt = (n: number | null | undefined, decimals = 3) =>
  n === null || n === undefined ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** The full initial/final/outturn table the spec requires ("AI shall not provide only the final outturn"). */
export function OutturnTrailDisplay({ trail }: { trail: OutturnTrail }) {
  const { initial, final, outturn } = trail;

  const rows: { label: string; initial: string; final: string; outturn?: string }[] = [
    { label: "Dip (mm)", initial: fmt(initial.input.dipMm, 2), final: fmt(final.input.dipMm, 2) },
    { label: "Water dip (mm)", initial: fmt(initial.input.waterDipMm, 2), final: fmt(final.input.waterDipMm, 2) },
    { label: "TGV (L)", initial: fmt(initial.input.tgvL), final: fmt(final.input.tgvL) },
    { label: "Water volume (L)", initial: fmt(initial.input.waterVolumeL), final: fmt(final.input.waterVolumeL) },
    { label: "Roof volume (L)", initial: fmt(initial.input.roofVolumeL), final: fmt(final.input.roofVolumeL) },
    { label: "GOV (L)", initial: fmt(initial.result?.gov), final: fmt(final.result?.gov), outturn: fmt(outturn?.govOutturnL) },
    { label: "Temperature (°C)", initial: fmt(initial.input.temperatureC, 2), final: fmt(final.input.temperatureC, 2) },
    { label: "Density @ 20°C", initial: fmt(initial.input.densityAt20, 4), final: fmt(final.input.densityAt20, 4) },
    { label: "VCF", initial: fmt(initial.input.vcf, 5), final: fmt(final.input.vcf, 5) },
    { label: "GSV (L)", initial: fmt(initial.result?.gsv), final: fmt(final.result?.gsv), outturn: fmt(outturn?.volumeOutturnL) },
    ...(trail.isCrudeOil
      ? [
          { label: "S&W (%)", initial: fmt(initial.input.swPercent, 3), final: fmt(final.input.swPercent, 3) },
          {
            label: "Net Standard Volume (L)",
            initial: fmt(initial.result?.netStandardVolumeL),
            final: fmt(final.result?.netStandardVolumeL),
            outturn: fmt(outturn?.netOutturnL),
          },
        ]
      : []),
    { label: "US BBL", initial: fmt(initial.result?.usBbl), final: fmt(final.result?.usBbl), outturn: fmt(outturn?.usBblOutturn) },
    { label: "Air buoyancy correction (Mt)", initial: fmt(initial.result?.airBuoyancyCorrectionMt), final: fmt(final.result?.airBuoyancyCorrectionMt) },
    { label: "Metric Tonnes Vacuum", initial: fmt(initial.result?.mtVac), final: fmt(final.result?.mtVac), outturn: fmt(outturn?.mtVacOutturn) },
    { label: "Metric Tonnes Air", initial: fmt(initial.result?.mtAir), final: fmt(final.result?.mtAir), outturn: fmt(outturn?.mtAirOutturn) },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm font-semibold text-navy-950">
        {trail.movementType === "receipt" ? "Receipt into tank" : "Delivery / issue from tank"}
      </p>

      {trail.blockingErrors.length > 0 && <ErrorBanner lines={trail.blockingErrors} />}
      {trail.warnings.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-[rgba(201,142,18,0.35)] bg-[rgba(201,142,18,0.08)] p-3 text-sm text-gold-600">
          {trail.warnings.map((w, i) => (
            <p key={i} className="m-0 flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {w}
            </p>
          ))}
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Parameter</TableHead>
            <TableHead>Initial</TableHead>
            <TableHead>Final</TableHead>
            <TableHead>Outturn</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.label}>
              <TableCell className="font-medium text-navy-950">{r.label}</TableCell>
              <TableCell>{r.initial}</TableCell>
              <TableCell>{r.final}</TableCell>
              <TableCell className="font-semibold text-navy-950">{r.outturn ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ErrorBanner({ lines }: { lines: string[] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      {lines.map((w, i) => (
        <p key={i} className="m-0 flex items-start gap-1.5">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {w}
        </p>
      ))}
    </div>
  );
}
