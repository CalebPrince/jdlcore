"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import {
  extractStockSheet,
  commitStockImport,
  type DraftRow,
  type ExtractState,
  type CommitState,
} from "@/app/actions/stock-import";
import type { ReadingField } from "@/lib/ai/stock-sheet-extract";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const extractInit: ExtractState = { ok: false, message: "" };
const commitInit: CommitState = { ok: false, message: "" };

/** Columns shown in the review grid (the rest ride along hidden in row state). */
const GRID_FIELDS: { key: ReadingField; label: string }[] = [
  { key: "dipHeightMm", label: "Dip (mm)" },
  { key: "temperatureC", label: "Temp °C" },
  { key: "densityAt20", label: "Density@20" },
  { key: "vcf", label: "VCF" },
  { key: "gsv", label: "GSV" },
  { key: "netWeightAir", label: "Net wt (air)" },
  { key: "pumpableStock", label: "Pumpable" },
];

export function StockSheetImport({
  jobId,
  tanks,
}: {
  jobId: number;
  tanks: { id: number; name: string }[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [notes, setNotes] = useState("");
  const [provider, setProvider] = useState("");

  const [extractState, runExtract, extracting] = useActionState(
    async (prev: ExtractState, fd: FormData) => {
      const res = await extractStockSheet(prev, fd);
      if (res.ok && res.rows) {
        setRows(res.rows);
        setNotes(res.notes ?? "");
        setProvider(res.provider ?? "");
      }
      return res;
    },
    extractInit,
  );

  const [commitState, runCommit, committing] = useActionState(
    async (prev: CommitState, fd: FormData) => {
      const res = await commitStockImport(prev, fd);
      if (res.ok) setRows(null);
      return res;
    },
    commitInit,
  );

  function submitExtract() {
    const fd = new FormData(formRef.current!);
    fd.set("jobId", String(jobId));
    startTransition(() => runExtract(fd));
  }

  function submitCommit() {
    if (!rows) return;
    // Only rows with a tank and no unresolved numeric problem get sent.
    const payload = rows
      .filter((r) => r.tankId != null && !r.issues.some((x) => x.includes("isn't a valid number")))
      .map((r) => ({ tankId: r.tankId, readingDate: r.readingDate, statusRemark: r.statusRemark, values: r.values }));
    if (payload.length === 0) return;
    const fd = new FormData(formRef.current!);
    fd.set("jobId", String(jobId));
    fd.set("rowsJson", JSON.stringify(payload));
    fd.set("provider", provider);
    startTransition(() => runCommit(fd));
  }

  function patch(i: number, next: Partial<DraftRow>) {
    setRows((cur) => (cur ? cur.map((r, idx) => (idx === i ? { ...r, ...next } : r)) : cur));
  }
  function patchValue(i: number, key: ReadingField, v: string) {
    setRows((cur) =>
      cur
        ? cur.map((r, idx) =>
            idx === i ? { ...r, values: { ...r.values, [key]: v }, issues: r.issues.filter((x) => !x.startsWith(`${key}:`)) } : r,
          )
        : cur,
    );
  }

  const importable = rows
    ? rows.filter((r) => r.tankId != null && !r.issues.some((x) => x.includes("isn't a valid number"))).length
    : 0;

  return (
    <form ref={formRef} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-navy-950" htmlFor={`ssi-file-${jobId}`}>
          Depot stock sheet
        </label>
        <Input
          id={`ssi-file-${jobId}`}
          name="file"
          type="file"
          accept=".xlsx,.csv,.tsv,.txt,.pdf,image/*"
          required
        />
        <p className="m-0 text-xs text-muted-foreground">
          Excel (.xlsx), CSV, PDF, or a photo of the sheet. Old .xls: open in Excel and Save As .xlsx first.
          Upload one day&apos;s sheet at a time.
        </p>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={extracting || committing}
          onClick={submitExtract}
        >
          {extracting ? "Reading sheet…" : "Extract readings"}
        </Button>
      </div>

      {!extractState.ok && extractState.message && (
        <Alert variant="destructive">
          <AlertDescription>{extractState.message}</AlertDescription>
        </Alert>
      )}

      {commitState.ok && commitState.message && (
        <Alert className="border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
          <AlertDescription className="text-[#1f7a4d]">{commitState.message}</AlertDescription>
        </Alert>
      )}
      {!commitState.ok && commitState.message && (
        <Alert variant="destructive">
          <AlertDescription>{commitState.message}</AlertDescription>
        </Alert>
      )}

      {rows && (
        <div className="flex flex-col gap-3">
          {notes && (
            <p className="m-0 rounded-md border border-dashed p-2.5 text-xs text-muted-foreground">
              <span className="font-semibold">Extractor notes:</span> {notes}
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tank</TableHead>
                  <TableHead>Date</TableHead>
                  {GRID_FIELDS.map((f) => (
                    <TableHead key={f.key} className="whitespace-nowrap">
                      {f.label}
                    </TableHead>
                  ))}
                  <TableHead>Remark</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const numericIssue = r.issues.some((x) => x.includes("isn't a valid number"));
                  return (
                    <TableRow key={i} className={r.tankId == null ? "bg-red-500/5" : undefined}>
                      <TableCell>
                        <select
                          value={r.tankId ?? ""}
                          onChange={(e) => patch(i, { tankId: e.target.value ? Number(e.target.value) : null })}
                          className="h-8 w-full min-w-[120px] rounded-md border border-input bg-transparent px-2 text-sm"
                        >
                          <option value="">— pick — ({r.tank})</option>
                          {tanks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={r.readingDate}
                          onChange={(e) => patch(i, { readingDate: e.target.value })}
                          className="h-8 w-[140px]"
                        />
                      </TableCell>
                      {GRID_FIELDS.map((f) => (
                        <TableCell key={f.key}>
                          <Input
                            inputMode="decimal"
                            value={r.values[f.key] ?? ""}
                            onChange={(e) => patchValue(i, f.key, e.target.value)}
                            className="h-8 w-[92px]"
                          />
                        </TableCell>
                      ))}
                      <TableCell>
                        <Input
                          value={r.statusRemark ?? ""}
                          maxLength={40}
                          onChange={(e) => patch(i, { statusRemark: e.target.value || null })}
                          className="h-8 w-[120px]"
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setRows((cur) => (cur ? cur.filter((_, idx) => idx !== i) : cur))}
                          className="text-xs text-muted-foreground underline-offset-2 hover:text-red-600 hover:underline"
                        >
                          remove
                        </button>
                        {numericIssue && (
                          <p className="m-0 mt-1 text-[11px] text-red-600">
                            {r.issues.filter((x) => x.includes("isn't a valid")).join("; ")}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="btn-gold" disabled={committing || importable === 0} onClick={submitCommit}>
              {committing ? "Importing…" : `Import ${importable} reading${importable === 1 ? "" : "s"}`}
            </Button>
            <button
              type="button"
              onClick={() => setRows(null)}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              Discard
            </button>
            {importable < rows.length && (
              <span className="text-xs text-muted-foreground">
                {rows.length - importable} row(s) need a tank or a valid number before they&apos;ll import.
              </span>
            )}
          </div>
        </div>
      )}
    </form>
  );
}
