import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, inspectors, jobCompletionData, jobs, stockReadings, tanks } from "@/db/schema";

/** Falls back to submittedAt when the inspector left the optional completion date blank. */
const effectiveDate = sql<string>`coalesce(${jobCompletionData.dateTimeCompleted}, ${jobCompletionData.submittedAt})`;

export type ReportFilters = {
  clientId?: number;
  inspectorId?: number;
  serviceType?: string;
  from?: string;
  to?: string;
};

export type GsvPoint = {
  jobId: number;
  ref: string;
  date: string;
  gsv: number | null;
  gov: number | null;
  metricTonnesAir: number | null;
  metricTonnesVacuum: number | null;
  clientName: string;
  serviceType: string | null;
};

export async function loadGsvSeries(filters: ReportFilters): Promise<GsvPoint[]> {
  const db = requireDb();
  const conditions: SQL[] = [];
  if (filters.clientId) conditions.push(eq(jobs.clientId, filters.clientId));
  if (filters.inspectorId) conditions.push(eq(jobs.assignedInspectorId, filters.inspectorId));
  if (filters.serviceType) conditions.push(eq(jobs.serviceType, filters.serviceType));
  if (filters.from) conditions.push(gte(effectiveDate, filters.from));
  if (filters.to) conditions.push(lte(effectiveDate, `${filters.to}T23:59:59.999Z`));

  const rows = await db
    .select({
      jobId: jobs.id,
      ref: jobs.ref,
      date: effectiveDate,
      gsv: jobCompletionData.gsv,
      gov: jobCompletionData.gov,
      metricTonnesAir: jobCompletionData.metricTonnesAir,
      metricTonnesVacuum: jobCompletionData.metricTonnesVacuum,
      clientName: clients.name,
      serviceType: jobs.serviceType,
    })
    .from(jobCompletionData)
    .innerJoin(jobs, eq(jobCompletionData.jobId, jobs.id))
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(effectiveDate));

  return rows
    .filter((r) => r.date != null)
    .map((r) => ({
      jobId: r.jobId,
      ref: r.ref,
      date: new Date(r.date!).toISOString(),
      gsv: r.gsv != null ? Number(r.gsv) : null,
      gov: r.gov != null ? Number(r.gov) : null,
      metricTonnesAir: r.metricTonnesAir != null ? Number(r.metricTonnesAir) : null,
      metricTonnesVacuum: r.metricTonnesVacuum != null ? Number(r.metricTonnesVacuum) : null,
      clientName: r.clientName,
      serviceType: r.serviceType,
    }));
}

export type StockPoint = {
  id: number;
  tankId: number;
  tankName: string;
  clientName: string;
  date: string;
  opening: number | null;
  closing: number | null;
  gsv: number | null;
};

export async function loadStockSeries(filters: ReportFilters): Promise<StockPoint[]> {
  const db = requireDb();
  const conditions: SQL[] = [];
  if (filters.clientId) conditions.push(eq(tanks.clientId, filters.clientId));
  if (filters.from) conditions.push(gte(stockReadings.readingDate, new Date(filters.from)));
  if (filters.to) conditions.push(lte(stockReadings.readingDate, new Date(`${filters.to}T23:59:59.999Z`)));

  const rows = await db
    .select({
      id: stockReadings.id,
      tankId: stockReadings.tankId,
      tankName: tanks.name,
      clientName: clients.name,
      date: stockReadings.readingDate,
      opening: stockReadings.openingStock,
      closing: stockReadings.closingStock,
      gsv: stockReadings.gsv,
    })
    .from(stockReadings)
    .innerJoin(tanks, eq(stockReadings.tankId, tanks.id))
    .innerJoin(clients, eq(tanks.clientId, clients.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(stockReadings.readingDate));

  return rows.map((r) => ({
    id: r.id,
    tankId: r.tankId,
    tankName: r.tankName,
    clientName: r.clientName,
    date: r.date.toISOString(),
    opening: r.opening != null ? Number(r.opening) : null,
    closing: r.closing != null ? Number(r.closing) : null,
    gsv: r.gsv != null ? Number(r.gsv) : null,
  }));
}

export type TankGauge = {
  tankId: number;
  name: string;
  clientName: string;
  product: string | null;
  capacity: number | null;
  capacityUnit: string;
  latestClosing: number | null;
  latestDate: string | null;
  utilizationPct: number | null;
};

export async function loadTankGauges(filters: { clientId?: number }): Promise<TankGauge[]> {
  const db = requireDb();
  const conditions: SQL[] = [eq(tanks.active, true)];
  if (filters.clientId) conditions.push(eq(tanks.clientId, filters.clientId));

  const tankRows = await db
    .select({
      id: tanks.id,
      name: tanks.name,
      clientName: clients.name,
      product: tanks.product,
      capacity: tanks.capacity,
      capacityUnit: tanks.capacityUnit,
    })
    .from(tanks)
    .innerJoin(clients, eq(tanks.clientId, clients.id))
    .where(and(...conditions));

  if (tankRows.length === 0) return [];

  const readingRows = await db
    .select({
      tankId: stockReadings.tankId,
      closing: stockReadings.closingStock,
      date: stockReadings.readingDate,
    })
    .from(stockReadings)
    .orderBy(desc(stockReadings.readingDate));

  const latestByTank = new Map<number, { closing: number | null; date: Date }>();
  for (const r of readingRows) {
    if (!latestByTank.has(r.tankId)) {
      latestByTank.set(r.tankId, { closing: r.closing != null ? Number(r.closing) : null, date: r.date });
    }
  }

  return tankRows.map((t) => {
    const latest = latestByTank.get(t.id);
    const capacity = t.capacity != null ? Number(t.capacity) : null;
    const closing = latest?.closing ?? null;
    return {
      tankId: t.id,
      name: t.name,
      clientName: t.clientName,
      product: t.product,
      capacity,
      capacityUnit: t.capacityUnit,
      latestClosing: closing,
      latestDate: latest?.date.toISOString() ?? null,
      utilizationPct: capacity && closing != null ? Math.min(100, Math.round((closing / capacity) * 100)) : null,
    };
  });
}

export async function loadInspectorOptions() {
  const db = requireDb();
  return db
    .select({ id: inspectors.id, name: inspectors.name })
    .from(inspectors)
    .orderBy(asc(inspectors.name));
}

export async function loadClientOptions() {
  const db = requireDb();
  return db
    .select({ id: clients.id, name: clients.name, company: clients.company })
    .from(clients)
    .orderBy(asc(clients.name));
}
