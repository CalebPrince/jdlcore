"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import {
  addCalibrationPoint,
  commitCalibrationImport,
  deleteCalibrationPoint,
  previewCalibrationImport,
  type CalibrationDraftRow,
  type CalibrationPreviewState,
} from "@/app/actions/tank-calibration-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FormState } from "@/app/actions/submissions";

const formInit: FormState = { ok: false, message: "" };
const previewInit: CalibrationPreviewState = { ok: false, message: "" };

function Feedback({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert
      variant={state.ok ? undefined : "destructive"}
      className={state.ok ? "mt-3 border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]" : "mt-3"}
    >
      <AlertDescription className={state.ok ? "text-[#1f7a4d]" : undefined}>{state.message}</AlertDescription>
    </Alert>
  );
}

export function AddCalibrationPointForm({ tankId, hasFloatingRoof }: { tankId: number; hasFloatingRoof: boolean }) {
  const [state, action, pending] = useActionState(addCalibrationPoint, formInit);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">Add one point</CardTitle>
        <CardDescription>Adding a point at a dip that&apos;s already calibrated replaces it.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input type="hidden" name="tankId" value={tankId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-dip">Dip (mm)</Label>
            <Input id="cp-dip" name="dipMm" type="number" step="0.01" required placeholder="8000" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cp-vol">Volume (L)</Label>
            <Input id="cp-vol" name="volumeLitres" type="number" step="0.001" min="0" required placeholder="5010000.000" />
          </div>
          {hasFloatingRoof && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cp-roof">Roof correction (L)</Label>
              <Input id="cp-roof" name="roofCorrectionLitres" type="number" step="0.001" min="0" placeholder="1200.000" />
            </div>
          )}
          <div className="flex items-end">
            <Button type="submit" disabled={pending} className="btn-gold">
              {pending ? "Saving…" : "Save point"}
            </Button>
          </div>
        </form>
        <Feedback state={state} />
      </CardContent>
    </Card>
  );
}

export function CalibrationPasteImport({ tankId, hasFloatingRoof }: { tankId: number; hasFloatingRoof: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [rows, setRows] = useState<CalibrationDraftRow[] | null>(null);

  const [previewState, runPreview, previewing] = useActionState(
    async (prev: CalibrationPreviewState, fd: FormData) => {
      const res = await previewCalibrationImport(prev, fd);
      if (res.ok && res.rows) setRows(res.rows);
      return res;
    },
    previewInit,
  );

  const [commitState, runCommit, committing] = useActionState(
    async (prev: FormState, fd: FormData) => {
      const res = await commitCalibrationImport(prev, fd);
      if (res.ok) setRows(null);
      return res;
    },
    formInit,
  );

  function submitPreview() {
    const fd = new FormData(formRef.current!);
    startTransition(() => runPreview(fd));
  }

  function submitCommit() {
    if (!rows) return;
    const clean = rows.filter((r) => r.issues.length === 0);
    if (clean.length === 0) return;
    const fd = new FormData();
    fd.set("tankId", String(tankId));
    fd.set(
      "rowsJson",
      JSON.stringify(clean.map((r) => ({ dipMm: r.dipMm, volumeLitres: r.volumeLitres, roofCorrectionLitres: r.roofCorrectionLitres }))),
    );
    startTransition(() => runCommit(fd));
  }

  const cleanCount = rows ? rows.filter((r) => r.issues.length === 0).length : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">Paste many points at once</CardTitle>
        <CardDescription>
          One row per line: dip, volume{hasFloatingRoof ? ", roof correction" : ""} — comma or tab separated. Review before
          importing; importing again for the same dip replaces that row.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form ref={formRef}>
          <input type="hidden" name="tankId" value={tankId} />
          <textarea
            name="pasted"
            rows={6}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs"
            placeholder={hasFloatingRoof ? "0,0,0\n100,62500.000,780.000\n200,125100.000,1560.000" : "0,0\n100,62500.000\n200,125100.000"}
          />
        </form>
        <Button type="button" variant="outline" className="self-start" disabled={previewing} onClick={submitPreview}>
          {previewing ? "Parsing…" : "Preview"}
        </Button>
        <Feedback state={previewState} />

        {rows && rows.length > 0 && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Dip (mm)</TableHead>
                  <TableHead>Volume (L)</TableHead>
                  {hasFloatingRoof && <TableHead>Roof correction (L)</TableHead>}
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.line}>
                    <TableCell>{r.line}</TableCell>
                    <TableCell>{r.dipMm ?? "—"}</TableCell>
                    <TableCell>{r.volumeLitres ?? "—"}</TableCell>
                    {hasFloatingRoof && <TableCell>{r.roofCorrectionLitres ?? "—"}</TableCell>}
                    <TableCell className={r.issues.length ? "text-destructive" : "text-muted-foreground"}>
                      {r.issues.length ? r.issues.join("; ") : "OK"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button type="button" disabled={committing || cleanCount === 0} className="btn-gold self-start" onClick={submitCommit}>
              {committing ? "Importing…" : `Import ${cleanCount} row(s)`}
            </Button>
            <Feedback state={commitState} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function CalibrationPointsTable({
  tankId,
  points,
  hasFloatingRoof,
}: {
  tankId: number;
  points: { id: number; dipMm: string; volumeLitres: string; roofCorrectionLitres: string | null }[];
  hasFloatingRoof: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base">Calibration table ({points.length} point(s))</CardTitle>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">
            No calibration points yet. Until points are added here, inspectors enter TGV directly for this tank.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dip (mm)</TableHead>
                <TableHead>Volume (L)</TableHead>
                {hasFloatingRoof && <TableHead>Roof correction (L)</TableHead>}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {points.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{Number(p.dipMm).toLocaleString()}</TableCell>
                  <TableCell>{Number(p.volumeLitres).toLocaleString()}</TableCell>
                  {hasFloatingRoof && <TableCell>{p.roofCorrectionLitres ? Number(p.roofCorrectionLitres).toLocaleString() : "—"}</TableCell>}
                  <TableCell>
                    <form action={deleteCalibrationPoint}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="tankId" value={tankId} />
                      <Button type="submit" variant="ghost" size="sm">
                        Remove
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
