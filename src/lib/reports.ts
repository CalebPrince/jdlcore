import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients, inspectors, jobCompletionData, jobs, stockImports, stockReadings, tanks } from "@/db/schema";

/** Falls back to submittedAt when the inspector left the optional completion date blank. */
const effectiveDate = sql<string>`coalesce(${jobCompletionData.dateTimeCompleted}, ${jobCompletionData.submittedAt})`;

export type ReportFilters = {
  clientId?: number;
  inspectorId?: number;
  serviceType?: string;
  product?: string;
  depot?: string;
  tankId?: number;
  from?: string;
  to?: string;
};

const num = (v: string | number | null | undefined): number | null =>
  v == null || v === "" ? null : Number(v);

const dayKey = (d: Date | string): string => new Date(d).toISOString().slice(0, 10);

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
  if (filters.product) conditions.push(eq(tanks.product, filters.product));
  if (filters.depot) conditions.push(eq(tanks.depot, filters.depot));
  if (filters.tankId) conditions.push(eq(stockReadings.tankId, filters.tankId));
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
  kind: "tank" | "pipeline";
  clientName: string;
  product: string | null;
  depot: string | null;
  capacity: number | null;
  capacityUnit: string;
  maxGaugeHeightMm: number | null;
  minPumpableStop: number | null;
  /** Latest reading in scope. */
  readingDate: string | null;
  dipHeightMm: number | null;
  temperatureC: number | null;
  densityAt20: number | null;
  vcf: number | null;
  gov: number | null;
  gsv: number | null;
  closing: number | null;
  netWeightAir: number | null;
  pumpableStock: number | null;
  statusRemark: string | null;
  /** Derived. */
  fillPct: number | null;
  belowMinStop: boolean;
  deltaNetWeight: number | null;
  /** Kept for the simple utilization view (closing ÷ capacity). */
  utilizationPct: number | null;
};

export type DepotBoard = {
  depot: string | null;
  clientName: string | null;
  asOf: string | null;
  missingDays: string[];
  maxGaugeHeightMm: number | null;
  sourceLabel: string | null;
  totals: {
    gsv: number;
    netWeightAir: number;
    pumpableStock: number;
    inServiceCount: number;
    pipelineCount: number;
  };
  tanks: TankGauge[];
  pipelines: TankGauge[];
};

function tankScopeConditions(filters: ReportFilters): SQL[] {
  const conditions: SQL[] = [eq(tanks.active, true)];
  if (filters.clientId) conditions.push(eq(tanks.clientId, filters.clientId));
  if (filters.product) conditions.push(eq(tanks.product, filters.product));
  if (filters.depot) conditions.push(eq(tanks.depot, filters.depot));
  if (filters.tankId) conditions.push(eq(tanks.id, filters.tankId));
  return conditions;
}

export async function loadGaugeBoard(filters: ReportFilters): Promise<DepotBoard[]> {
  const db = requireDb();

  const tankRows = await db
    .select({
      id: tanks.id,
      name: tanks.name,
      kind: tanks.kind,
      clientName: clients.name,
      product: tanks.product,
      depot: tanks.depot,
      capacity: tanks.capacity,
      capacityUnit: tanks.capacityUnit,
      maxGaugeHeightMm: tanks.maxGaugeHeightMm,
      minPumpableStop: tanks.minPumpableStop,
    })
    .from(tanks)
    .innerJoin(clients, eq(tanks.clientId, clients.id))
    .where(and(...tankScopeConditions(filters)));

  if (tankRows.length === 0) return [];
  const tankIds = tankRows.map((t) => t.id);

  const dateConds: SQL[] = [inArray(stockReadings.tankId, tankIds)];
  if (filters.from) dateConds.push(gte(stockReadings.readingDate, new Date(filters.from)));
  if (filters.to) dateConds.push(lte(stockReadings.readingDate, new Date(`${filters.to}T23:59:59.999Z`)));

  const readingRows = await db
    .select()
    .from(stockReadings)
    .where(and(...dateConds))
    .orderBy(desc(stockReadings.readingDate));

  const byTank = new Map<number, (typeof readingRows)>();
  for (const r of readingRows) {
    const list = byTank.get(r.tankId) ?? [];
    list.push(r);
    byTank.set(r.tankId, list);
  }

  // Newest imported sheet name per job in scope, for the "Source:" footer line.
  const jobIds = [...new Set(readingRows.map((r) => r.jobId))];
  const importByJob = new Map<number, string>();
  if (jobIds.length) {
    const imps = await db
      .select({ jobId: stockImports.jobId, fileName: stockImports.fileName, createdAt: stockImports.createdAt })
      .from(stockImports)
      .where(inArray(stockImports.jobId, jobIds))
      .orderBy(desc(stockImports.createdAt));
    for (const im of imps) if (!importByJob.has(im.jobId)) importByJob.set(im.jobId, im.fileName);
  }
  const tankToJobs = new Map<number, number[]>();
  for (const r of readingRows) {
    const arr = tankToJobs.get(r.tankId) ?? [];
    if (!arr.includes(r.jobId)) arr.push(r.jobId);
    tankToJobs.set(r.tankId, arr);
  }

  const gauges: TankGauge[] = tankRows.map((t) => {
    const list = byTank.get(t.id) ?? [];
    const latest = list[0];
    const prev = list[1];
    const capacity = num(t.capacity);
    const maxHeight = num(t.maxGaugeHeightMm);
    const minStop = num(t.minPumpableStop);
    const dip = num(latest?.dipHeightMm);
    const closing = num(latest?.closingStock);
    const pumpable = num(latest?.pumpableStock);
    const netAir = num(latest?.netWeightAir);
    const prevNetAir = num(prev?.netWeightAir);

    let fillPct: number | null = null;
    if (dip != null && maxHeight && maxHeight > 0) fillPct = (dip / maxHeight) * 100;
    else if (closing != null && capacity && capacity > 0) fillPct = (closing / capacity) * 100;
    if (fillPct != null) fillPct = Math.max(0, Math.min(100, fillPct));

    const belowMinStop =
      pumpable != null
        ? pumpable <= 0
        : minStop != null && closing != null
          ? closing <= minStop
          : false;

    return {
      tankId: t.id,
      name: t.name,
      kind: t.kind === "pipeline" ? "pipeline" : "tank",
      clientName: t.clientName,
      product: t.product,
      depot: t.depot,
      capacity,
      capacityUnit: t.capacityUnit,
      maxGaugeHeightMm: maxHeight,
      minPumpableStop: minStop,
      readingDate: latest?.readingDate.toISOString() ?? null,
      dipHeightMm: dip,
      temperatureC: num(latest?.temperatureC),
      densityAt20: num(latest?.densityAt20),
      vcf: num(latest?.vcf),
      gov: num(latest?.gov),
      gsv: num(latest?.gsv),
      closing,
      netWeightAir: netAir,
      pumpableStock: pumpable,
      statusRemark: latest?.statusRemark ?? null,
      fillPct,
      belowMinStop,
      deltaNetWeight: netAir != null && prevNetAir != null ? netAir - prevNetAir : null,
      utilizationPct:
        capacity && closing != null ? Math.max(0, Math.min(100, Math.round((closing / capacity) * 100))) : null,
    };
  });

  const readingDatesByTank = new Map<number, Set<string>>();
  for (const r of readingRows) {
    const set = readingDatesByTank.get(r.tankId) ?? new Set<string>();
    set.add(dayKey(r.readingDate));
    readingDatesByTank.set(r.tankId, set);
  }

  const groups = new Map<string, TankGauge[]>();
  for (const g of gauges) {
    const key = g.depot ?? "";
    const list = groups.get(key) ?? [];
    list.push(g);
    groups.set(key, list);
  }

  const boards: DepotBoard[] = [];
  for (const [key, list] of groups) {
    const inService = list.filter((g) => g.readingDate != null);
    const asOf =
      inService.length > 0
        ? inService.reduce((a, g) => (g.readingDate! > a ? g.readingDate! : a), inService[0].readingDate!)
        : null;

    const depotDays = new Set<string>();
    for (const g of list) for (const d of readingDatesByTank.get(g.tankId) ?? []) depotDays.add(d);

    let missingDays: string[] = [];
    if (asOf) {
      const end = new Date(dayKey(asOf));
      const start = filters.from ? new Date(filters.from) : new Date(end.getTime() - 31 * 86400000);
      for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
        const k = d.toISOString().slice(0, 10);
        if (!depotDays.has(k)) missingDays.push(k);
      }
      if (missingDays.length > 20) missingDays = [];
    }

    const sourceLabel =
      [...new Set(list.flatMap((g) => (tankToJobs.get(g.tankId) ?? []).map((j) => importByJob.get(j)).filter(Boolean)))][0] ??
      null;
    const maxHeights = list.map((g) => g.maxGaugeHeightMm).filter((h): h is number => h != null);
    const uniformHeight = maxHeights.length && maxHeights.every((h) => h === maxHeights[0]) ? maxHeights[0] : null;

    boards.push({
      depot: key || null,
      clientName: list[0]?.clientName ?? null,
      asOf,
      missingDays,
      maxGaugeHeightMm: uniformHeight,
      sourceLabel: sourceLabel as string | null,
      totals: {
        gsv: sumField(inService, "gsv"),
        netWeightAir: sumField(inService, "netWeightAir"),
        pumpableStock: sumField(inService, "pumpableStock"),
        inServiceCount: inService.filter((g) => g.kind === "tank").length,
        pipelineCount: inService.filter((g) => g.kind === "pipeline").length,
      },
      tanks: list.filter((g) => g.kind === "tank"),
      pipelines: list.filter((g) => g.kind === "pipeline"),
    });
  }

  return boards.sort((a, b) => (a.depot ?? "").localeCompare(b.depot ?? ""));
}

function sumField(gauges: TankGauge[], field: "gsv" | "netWeightAir" | "pumpableStock"): number {
  return gauges.reduce((total, g) => total + (g[field] ?? 0), 0);
}

export type TankTrend = {
  tankId: number;
  tankName: string;
  product: string | null;
  points: { date: string; gsv: number }[];
  change: number | null;
};

export async function loadTankTrendSeries(filters: ReportFilters, days = 32): Promise<TankTrend[]> {
  const db = requireDb();

  const tankRows = await db
    .select({ id: tanks.id, name: tanks.name, product: tanks.product })
    .from(tanks)
    .where(and(...tankScopeConditions(filters)));
  if (tankRows.length === 0) return [];
  const tankIds = tankRows.map((t) => t.id);

  const from = filters.from ? new Date(filters.from) : new Date(Date.now() - days * 86400000);
  const conds: SQL[] = [inArray(stockReadings.tankId, tankIds), gte(stockReadings.readingDate, from)];
  if (filters.to) conds.push(lte(stockReadings.readingDate, new Date(`${filters.to}T23:59:59.999Z`)));

  const rows = await db
    .select({ tankId: stockReadings.tankId, date: stockReadings.readingDate, gsv: stockReadings.gsv })
    .from(stockReadings)
    .where(and(...conds))
    .orderBy(asc(stockReadings.readingDate));

  const byTank = new Map<number, Map<string, number>>();
  for (const r of rows) {
    const gsv = num(r.gsv);
    if (gsv == null) continue;
    const m = byTank.get(r.tankId) ?? new Map<string, number>();
    m.set(dayKey(r.date), gsv);
    byTank.set(r.tankId, m);
  }

  return tankRows
    .map((t) => {
      const points = [...(byTank.get(t.id) ?? new Map())]
        .map(([date, gsv]) => ({ date, gsv: gsv as number }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        tankId: t.id,
        tankName: t.name,
        product: t.product,
        points,
        change: points.length >= 2 ? points[points.length - 1].gsv - points[0].gsv : null,
      };
    })
    .filter((t) => t.points.length > 0);
}

export async function loadTankFilterOptions(
  clientId?: number,
): Promise<{ products: string[]; depots: string[]; tanks: { id: number; name: string }[] }> {
  const db = requireDb();
  const conditions: SQL[] = [eq(tanks.active, true)];
  if (clientId) conditions.push(eq(tanks.clientId, clientId));

  const rows = await db
    .select({ id: tanks.id, name: tanks.name, product: tanks.product, depot: tanks.depot })
    .from(tanks)
    .where(and(...conditions))
    .orderBy(asc(tanks.name));

  return {
    products: [...new Set(rows.map((r) => r.product).filter((p): p is string => !!p))].sort(),
    depots: [...new Set(rows.map((r) => r.depot).filter((d): d is string => !!d))].sort(),
    tanks: rows.map((r) => ({ id: r.id, name: r.name })),
  };
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
