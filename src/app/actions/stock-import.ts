"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { jobUpdates, jobs, stockImports, stockReadings, tanks } from "@/db/schema";
import { getInspector } from "@/lib/inspector-auth";
import { getStaff } from "@/lib/staff-auth";
import { parseDecimal3, parseDecimalN } from "@/lib/decimal";
import { sheetToModelInput } from "@/lib/stock-sheet";
import {
  extractStockReadings,
  READING_FIELDS,
  type ReadingField,
} from "@/lib/ai/stock-sheet-extract";
import { reviewUploadedFile } from "@/lib/ai/document-review";

type Actor = { type: "inspector" | "staff"; id: number; name: string };

const OPS_ROLES = ["operations", "administrator", "superadmin"];

async function jobActor(jobId: number): Promise<{ actor: Actor; job: typeof jobs.$inferSelect } | null> {
  const rows = await requireDb().select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job) return null;

  const inspector = await getInspector();
  if (inspector && job.assignedInspectorId === inspector.id) {
    return { actor: { type: "inspector", id: inspector.id, name: inspector.name }, job };
  }
  const staff = await getStaff();
  if (staff && OPS_ROLES.includes(staff.role)) {
    return { actor: { type: "staff", id: staff.id, name: staff.name }, job };
  }
  return null;
}

const normLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export type DraftRow = {
  tank: string;
  tankId: number | null;
  readingDate: string;
  statusRemark: string | null;
  values: Partial<Record<ReadingField, string>>;
  issues: string[];
};

export type ExtractState = {
  ok: boolean;
  message: string;
  rows?: DraftRow[];
  notes?: string;
  provider?: string;
};

export type CommitState = {
  ok: boolean;
  message: string;
  imported?: number;
  overwritten?: number;
};

export async function extractStockSheet(_prev: ExtractState, formData: FormData): Promise<ExtractState> {
  const jobId = Number(formData.get("jobId"));
  const file = formData.get("file");
  if (!Number.isInteger(jobId) || jobId <= 0) return { ok: false, message: "Bad request." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a sheet to upload." };

  const ctx = await jobActor(jobId);
  if (!ctx) return { ok: false, message: "You can't import readings for this job." };
  if (ctx.job.serviceType !== "stock_monitoring") {
    return { ok: false, message: "Sheet import is only for Stock Monitoring jobs." };
  }

  const clientTanks = await requireDb()
    .select({ id: tanks.id, name: tanks.name })
    .from(tanks)
    .where(and(eq(tanks.clientId, ctx.job.clientId), eq(tanks.active, true)));

  let modelInput;
  try {
    modelInput = await sheetToModelInput(file);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Couldn't read that file." };
  }

  const defaultDate = new Date().toISOString().slice(0, 10);
  let result;
  try {
    result = await extractStockReadings({
      modelInput,
      tankNames: clientTanks.map((t) => t.name),
      product: ctx.job.product,
      defaultDate,
    });
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Extraction failed." };
  }

  const byLabel = new Map(clientTanks.map((t) => [normLabel(t.name), t.id]));
  const rows: DraftRow[] = result.rows.map((r) => {
    const issues: string[] = [];
    const values: Partial<Record<ReadingField, string>> = {};
    for (const field of Object.keys(READING_FIELDS) as ReadingField[]) {
      const raw = r[field];
      if (raw == null) continue;
      const scale = READING_FIELDS[field];
      const parsed = scale === 3 ? parseDecimal3(raw) : parseDecimalN(raw, scale);
      if (!parsed.ok) issues.push(`${field}: ${raw} isn't a valid number`);
      else if (parsed.value != null) values[field] = parsed.value;
    }
    const tankId = byLabel.get(normLabel(r.tank)) ?? null;
    if (tankId == null) issues.push(`"${r.tank}" doesn't match a tank on file — pick one`);
    return { tank: r.tank, tankId, readingDate: r.readingDate ?? defaultDate, statusRemark: r.statusRemark, values, issues };
  });

  if (rows.length === 0) {
    return { ok: false, message: "No tank readings were found in that sheet." };
  }

  return {
    ok: true,
    message: `Found ${rows.length} row${rows.length === 1 ? "" : "s"}. Review and import.`,
    rows,
    notes: result.notes,
    provider: result.provider,
  };
}

export async function commitStockImport(_prev: CommitState, formData: FormData): Promise<CommitState> {
  const jobId = Number(formData.get("jobId"));
  const rowsJson = String(formData.get("rowsJson") ?? "");
  const file = formData.get("file");
  if (!Number.isInteger(jobId) || jobId <= 0) return { ok: false, message: "Bad request." };

  const ctx = await jobActor(jobId);
  if (!ctx) return { ok: false, message: "You can't import readings for this job." };
  if (ctx.job.serviceType !== "stock_monitoring") {
    return { ok: false, message: "Sheet import is only for Stock Monitoring jobs." };
  }

  type IncomingRow = {
    tankId: number;
    readingDate: string;
    statusRemark?: string | null;
    values?: Record<string, string>;
  };
  let incoming: IncomingRow[];
  try {
    incoming = JSON.parse(rowsJson);
    if (!Array.isArray(incoming)) throw new Error();
  } catch {
    return { ok: false, message: "Nothing to import." };
  }

  const validTankIds = new Set(
    (await requireDb().select({ id: tanks.id }).from(tanks).where(eq(tanks.clientId, ctx.job.clientId))).map((t) => t.id),
  );

  const prepared: {
    tankId: number;
    readingDate: Date;
    dateKey: string;
    statusRemark: string | null;
    values: Partial<Record<ReadingField, string>>;
  }[] = [];

  for (const [i, row] of incoming.entries()) {
    if (!Number.isInteger(row.tankId) || !validTankIds.has(row.tankId)) {
      return { ok: false, message: `Row ${i + 1}: pick a tank that belongs to this client.` };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.readingDate)) {
      return { ok: false, message: `Row ${i + 1}: set a valid reading date.` };
    }
    const values: Partial<Record<ReadingField, string>> = {};
    for (const field of Object.keys(READING_FIELDS) as ReadingField[]) {
      const raw = row.values?.[field];
      if (raw == null || raw === "") continue;
      const scale = READING_FIELDS[field];
      const parsed = scale === 3 ? parseDecimal3(raw) : parseDecimalN(raw, scale);
      if (!parsed.ok) return { ok: false, message: `Row ${i + 1} — ${field}: ${parsed.message}` };
      if (parsed.value != null) values[field] = parsed.value;
    }
    prepared.push({
      tankId: row.tankId,
      readingDate: new Date(row.readingDate),
      dateKey: row.readingDate,
      statusRemark: row.statusRemark ? String(row.statusRemark).trim().slice(0, 40) || null : null,
      values,
    });
  }

  if (prepared.length === 0) return { ok: false, message: "Nothing to import." };

  const db = requireDb();
  const fileName = file instanceof File ? file.name : "stock sheet";
  const mimeType = file instanceof File ? file.type || null : null;
  const sizeBytes = file instanceof File ? file.size : null;
  let fileData: string | null = null;
  if (file instanceof File && file.size > 0 && file.size <= 4 * 1024 * 1024) {
    const buf = Buffer.from(await file.arrayBuffer());
    fileData = `data:${mimeType || "application/octet-stream"};base64,${buf.toString("base64")}`;
  }

  const [imp] = await db
    .insert(stockImports)
    .values({
      jobId,
      actorType: ctx.actor.type,
      actorId: ctx.actor.id,
      actorName: ctx.actor.name,
      fileName,
      mimeType,
      sizeBytes,
      provider: String(formData.get("provider") || "") || null,
      rowCount: prepared.length,
      fileData,
    })
    .returning({ id: stockImports.id });

  let overwritten = 0;
  for (const p of prepared) {
    const del = await db
      .delete(stockReadings)
      .where(
        and(
          eq(stockReadings.jobId, jobId),
          eq(stockReadings.tankId, p.tankId),
          sql`${stockReadings.readingDate}::date = ${p.dateKey}::date`,
        ),
      )
      .returning({ id: stockReadings.id });
    overwritten += del.length;

    await db.insert(stockReadings).values({
      jobId,
      tankId: p.tankId,
      readingDate: p.readingDate,
      openingStock: p.values.openingStock ?? null,
      receipts: p.values.receipts ?? null,
      transfers: p.values.transfers ?? null,
      dischargesLoads: p.values.dischargesLoads ?? null,
      closingStock: p.values.closingStock ?? null,
      gsv: p.values.gsv ?? null,
      dipHeightMm: p.values.dipHeightMm ?? null,
      temperatureC: p.values.temperatureC ?? null,
      densityAt20: p.values.densityAt20 ?? null,
      vcf: p.values.vcf ?? null,
      gov: p.values.gov ?? null,
      netWeightAir: p.values.netWeightAir ?? null,
      netWeightVacuum: p.values.netWeightVacuum ?? null,
      pumpableStock: p.values.pumpableStock ?? null,
      statusRemark: p.statusRemark,
      source: "import",
      importId: imp.id,
      recordedByInspectorId: ctx.actor.type === "inspector" ? ctx.actor.id : null,
    });
  }

  await db.insert(jobUpdates).values({
    jobId,
    status: ctx.job.status,
    note: `Imported ${prepared.length} stock reading${prepared.length === 1 ? "" : "s"} from "${fileName}".`,
    actorType: ctx.actor.type === "staff" ? "staff" : "inspector",
    actorId: ctx.actor.id,
    actorName: ctx.actor.name,
  });

  revalidatePath(`/inspector/jobs/${jobId}`);
  revalidatePath(`/admin/jobs/${jobId}`);

  if (fileData && (mimeType === "application/pdf" || mimeType?.startsWith("image/"))) {
    void reviewUploadedFile({
      jobId,
      jobRef: ctx.job.ref,
      targetType: "document",
      targetId: imp.id,
      fileDataUrl: fileData,
      context: `Uploaded stock sheet "${fileName}", used to import ${prepared.length} tank readings.`,
    });
  }

  const newRows = prepared.length - overwritten;
  return {
    ok: true,
    message:
      `Imported ${prepared.length} reading${prepared.length === 1 ? "" : "s"}` +
      (overwritten ? ` (${newRows} new, ${overwritten} replaced).` : "."),
    imported: prepared.length,
    overwritten,
  };
}
