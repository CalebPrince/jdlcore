"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import {
  clients,
  documents,
  inspectorAssignmentProfiles,
  inspectors,
  jobCompletionData,
  jobOutturns,
  jobOutturnTanks,
  jobUpdates,
  jobs,
  stockReadings,
  tanks,
} from "@/db/schema";
import {
  createInspectorSession,
  destroyInspectorSession,
  getInspector,
  verifyInspectorSetupToken,
} from "@/lib/inspector-auth";
import { hashPassword, verifyPassword } from "@/lib/portal-auth";
import { canTransition, type Actor } from "@/lib/job-workflow";
import type { JobStatus } from "@/lib/jobs";
import { notifyBoth, notifyStaffBoth } from "@/lib/notifications";
import { brandedEmailHtml } from "@/lib/email";
import { reviewCompletionData, reviewUploadedFile } from "@/lib/ai/document-review";
import { maybeAutoAssign } from "@/lib/automation/auto-assign";
import { recordApprovalCheck } from "@/lib/approval-checks";
import { parseDecimal3, parseDecimalN } from "@/lib/decimal";
import { lookupVolumeForDip } from "@/lib/tank-calibration";
import { calculateOutturn, calculateReading, type MovementType, type ReadingInput } from "@/lib/outturn";
import { sumOutturnTotals } from "@/lib/outturn-trail";
import type { FormState } from "./submissions";

const OPS_ROLES = ["operations", "administrator", "superadmin"] as const;

const initialFail = (message: string): FormState => ({ ok: false, message });

/* ---------------- Login / logout ---------------- */

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function inspectorLogin(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Enter a valid email and password.");

  const database = requireDb();
  const rows = await database
    .select()
    .from(inspectors)
    .where(eq(inspectors.email, parsed.data.email.toLowerCase()))
    .limit(1);
  const row = rows[0];
  if (!row || !row.active || row.status !== "active" || !row.passwordHash) {
    return initialFail("Invalid email or password.");
  }
  if (!verifyPassword(parsed.data.password, row.passwordHash)) {
    return initialFail("Invalid email or password.");
  }

  await createInspectorSession(row.id);
  await database.update(inspectors).set({ lastLoginAt: new Date() }).where(eq(inspectors.id, row.id));
  redirect("/inspector");
}

export async function inspectorLogout(): Promise<void> {
  await destroyInspectorSession();
  redirect("/inspector/login");
}

const setupSchema = z.object({
  token: z.string().trim().max(96),
  password: z.string().min(8).max(200),
});

export async function completeInspectorSetup(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Password must be at least 8 characters.");

  const row = await verifyInspectorSetupToken(parsed.data.token);
  if (!row) {
    return initialFail("This invite link is invalid or has expired. Ask Operations for a fresh one.");
  }

  try {
    const database = requireDb();
    await database
      .update(inspectors)
      .set({
        passwordHash: hashPassword(parsed.data.password),
        status: "active",
        setupToken: null,
        setupTokenExpires: null,
        lastLoginAt: new Date(),
      })
      .where(eq(inspectors.id, row.id));
    await createInspectorSession(row.id);
  } catch (err) {
    console.error("completeInspectorSetup:", err);
    return initialFail("Could not finish setup. Try again shortly.");
  }
  redirect("/inspector");
}

async function loadOwnJob(jobId: number, inspectorId: number) {
  const rows = await requireDb().select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  const job = rows[0];
  if (!job || job.assignedInspectorId !== inspectorId) return null;
  return job;
}

async function triggerCompletionReview(job: typeof jobs.$inferSelect): Promise<void> {
  const database = requireDb();
  const completionRows = await database
    .select()
    .from(jobCompletionData)
    .where(eq(jobCompletionData.jobId, job.id))
    .limit(1);
  const completion = completionRows[0];
  if (!completion) return;

  const priorRows = await database
    .select({
      gov: jobCompletionData.gov,
      gsv: jobCompletionData.gsv,
      submittedAt: jobCompletionData.submittedAt,
    })
    .from(jobCompletionData)
    .innerJoin(jobs, eq(jobCompletionData.jobId, jobs.id))
    .where(
      and(
        eq(jobs.clientId, job.clientId),
        job.product ? eq(jobs.product, job.product) : undefined,
      ),
    )
    .orderBy(desc(jobCompletionData.submittedAt))
    .limit(5);

  await reviewCompletionData({
    jobId: job.id,
    jobRef: job.ref,
    service: job.service,
    product: job.product,
    gov: completion.gov,
    gsv: completion.gsv,
    metricTonnesAir: completion.metricTonnesAir,
    metricTonnesVacuum: completion.metricTonnesVacuum,
    inspectorComments: completion.inspectorComments,
    priorReadings: priorRows
      .filter((r) => r.submittedAt)
      .map((r) => ({ gov: r.gov, gsv: r.gsv, date: r.submittedAt!.toISOString().slice(0, 10) })),
  });
}

function revalidateJob(jobId: number) {
  revalidatePath(`/inspector/jobs/${jobId}`);
  revalidatePath("/inspector");
  revalidatePath(`/admin/jobs/${jobId}`);
  revalidatePath("/admin/jobs");
  revalidatePath(`/portal/jobs/${jobId}`);
}

async function notifyOperationsRole(jobRef: string, title: string, body: string | undefined, jobId: number) {
  const message = body || `Job ${jobRef} needs Operations' attention.`;
  await notifyStaffBoth({
    roles: [...OPS_ROLES],
    type: "ops_action_needed",
    title,
    body: message,
    link: `/admin/jobs/${jobId}`,
    emailSubject: title,
    emailHtml: brandedEmailHtml({
      label: "JDL CORE ADMIN",
      heading: title,
      bodyLines: [message],
      ctaUrl: `https://jdlcore.com/admin/jobs/${jobId}`,
      ctaLabel: "Open Job",
    }),
  });
}

const jobIdSchema = z.object({ jobId: z.coerce.number().int().positive() });

/* ---------------- Accept / Decline ---------------- */

export async function acceptAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid job.");
  const job = await loadOwnJob(parsed.data.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");

  const actor: Actor = { type: "inspector", id: inspector.id, name: inspector.name };
  if (!canTransition(job.status as JobStatus, "inspector_accepted", actor)) {
    return initialFail("This job can't be accepted right now.");
  }

  const database = requireDb();
  await database
    .update(jobs)
    .set({ status: "inspector_accepted", acceptedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobs.id, job.id));
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: "inspector_accepted",
    note: `Accepted by ${inspector.name}.`,
    actorType: "inspector",
    actorId: inspector.id,
    actorName: inspector.name,
  });

  await notifyOperationsRole(job.ref, `${inspector.name} accepted job ${job.ref}`, undefined, job.id);

  revalidateJob(job.id);
  return { ok: true, message: "Assignment accepted." };
}

const declineSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  reason: z.string().trim().min(3, "Tell Operations why you're declining."),
});

export async function declineAssignment(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = declineSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const job = await loadOwnJob(parsed.data.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");

  const actor: Actor = { type: "inspector", id: inspector.id, name: inspector.name };
  if (!canTransition(job.status as JobStatus, "awaiting_assignment", actor)) {
    return initialFail("This job can't be declined right now.");
  }

  const database = requireDb();
  await database
    .update(jobs)
    .set({ status: "awaiting_assignment", assignedInspectorId: null, updatedAt: new Date() })
    .where(eq(jobs.id, job.id));
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: "awaiting_assignment",
    note: `Declined by ${inspector.name}: ${parsed.data.reason}`,
    actorType: "inspector",
    actorId: inspector.id,
    actorName: inspector.name,
  });

  await notifyOperationsRole(
    job.ref,
    `${inspector.name} declined job ${job.ref}`,
    `Reason: ${parsed.data.reason}`,
    job.id,
  );
  // If auto-assignment is on, offer it to the next eligible inspector straight away.
  await maybeAutoAssign(job.id);

  revalidateJob(job.id);
  return { ok: true, message: "Assignment declined — sent back to Operations." };
}

/* ---------------- Progress updates ---------------- */

const updateSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  note: z.string().trim().min(2, "Enter a short status update."),
});

export async function postProgressUpdate(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const job = await loadOwnJob(parsed.data.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");

  const actor: Actor = { type: "inspector", id: inspector.id, name: inspector.name };
  const nextStatus: JobStatus = "in_progress";
  const statusChanges = job.status !== "in_progress";
  if (statusChanges && !canTransition(job.status as JobStatus, nextStatus, actor)) {
    return initialFail("Can't post an update on this job right now.");
  }

  const database = requireDb();
  if (statusChanges) {
    await database.update(jobs).set({ status: nextStatus, updatedAt: new Date() }).where(eq(jobs.id, job.id));
  } else {
    await database.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, job.id));
  }
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: nextStatus,
    note: parsed.data.note,
    actorType: "inspector",
    actorId: inspector.id,
    actorName: inspector.name,
  });

  revalidateJob(job.id);
  return { ok: true, message: "Update posted." };
}

/* ---------------- Completion data (section 7) ---------------- */

const completionSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  dateTimeStarted: z.string().optional(),
  dateTimeCompleted: z.string().optional(),
  service: z.string().trim().max(200).optional(),
  gov: z.string().optional(),
  gsv: z.string().optional(),
  metricTonnesAir: z.string().optional(),
  metricTonnesVacuum: z.string().optional(),
  inspectorComments: z.string().trim().max(4000).optional(),
});

export async function saveCompletionData(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = completionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Check the fields entered.");
  const f = parsed.data;
  const job = await loadOwnJob(f.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");
  if (!["inspector_accepted", "in_progress", "rejected_amendment"].includes(job.status)) {
    return initialFail("This job isn't open for completion data right now.");
  }

  const gov = parseDecimal3(f.gov);
  if (!gov.ok) return initialFail(`GOV: ${gov.message}`);
  const gsv = parseDecimal3(f.gsv);
  if (!gsv.ok) return initialFail(`GSV: ${gsv.message}`);
  const mtAir = parseDecimal3(f.metricTonnesAir);
  if (!mtAir.ok) return initialFail(`Metric Tonnes in Air: ${mtAir.message}`);
  const mtVac = parseDecimal3(f.metricTonnesVacuum);
  if (!mtVac.ok) return initialFail(`Metric Tonnes in Vacuum: ${mtVac.message}`);

  const database = requireDb();
  const existing = await database
    .select({ id: jobCompletionData.id })
    .from(jobCompletionData)
    .where(eq(jobCompletionData.jobId, f.jobId))
    .limit(1);

  const values = {
    dateTimeStarted: f.dateTimeStarted ? new Date(f.dateTimeStarted) : null,
    dateTimeCompleted: f.dateTimeCompleted ? new Date(f.dateTimeCompleted) : null,
    service: f.service || null,
    gov: gov.value,
    gsv: gsv.value,
    metricTonnesAir: mtAir.value,
    metricTonnesVacuum: mtVac.value,
    inspectorComments: f.inspectorComments || null,
    updatedAt: new Date(),
  };

  if (existing[0]) {
    await database.update(jobCompletionData).set(values).where(eq(jobCompletionData.id, existing[0].id));
  } else {
    await database.insert(jobCompletionData).values({ jobId: f.jobId, ...values });
  }

  revalidateJob(f.jobId);
  return { ok: true, message: "Completion data saved." };
}

/* ---------------- Product outturn ---------------- */

const outturnSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  /** Present when editing an existing tank row; absent when adding a new one. */
  tankRowId: z.coerce.number().int().positive().optional(),
  movementType: z.enum(["receipt", "delivery"]),
  isCrudeOil: z.string().optional(),
  densityUnit: z.enum(["kg_m3", "g_cm3"]).default("kg_m3"),
  notes: z.string().trim().max(2000).optional(),

  initialTankId: z.coerce.number().int().positive(),
  initialDipMm: z.string().optional(),
  initialWaterDipMm: z.string().optional(),
  initialTemperatureC: z.string().optional(),
  initialDensityAt20: z.string().optional(),
  initialVcf: z.string().optional(),
  initialManualTgvL: z.string().optional(),
  initialManualWaterVolumeL: z.string().optional(),
  initialManualRoofVolumeL: z.string().optional(),
  initialSwPercent: z.string().optional(),
  initialAirBuoyancyOverrideMt: z.string().optional(),

  finalTankId: z.coerce.number().int().positive(),
  finalDipMm: z.string().optional(),
  finalWaterDipMm: z.string().optional(),
  finalTemperatureC: z.string().optional(),
  finalDensityAt20: z.string().optional(),
  finalVcf: z.string().optional(),
  finalManualTgvL: z.string().optional(),
  finalManualWaterVolumeL: z.string().optional(),
  finalManualRoofVolumeL: z.string().optional(),
  finalSwPercent: z.string().optional(),
  finalAirBuoyancyOverrideMt: z.string().optional(),
});

const round3 = (n: number): string => n.toFixed(3);

/** Numeric value of a successfully-parsed DecimalParse, or null (blank/unparseable — caller already collected the error). */
const numOf = (p: { ok: boolean; value?: string | null }): number | null =>
  p.ok && "value" in p && p.value !== null && p.value !== undefined ? Number(p.value) : null;

type Side = "initial" | "final";

/** Resolves TGV/water volume/roof volume for one side (calibration lookup, falling back to a manual override), and parses the rest of that side's raw fields. Returns field-prefixed errors, never throws. */
async function prepareSide(
  side: Side,
  f: z.infer<typeof outturnSchema>,
  tankId: number,
  densityUnit: "kg_m3" | "g_cm3",
  isCrudeOil: boolean,
): Promise<{ input: ReadingInput; errors: string[] }> {
  const label = side === "initial" ? "Initial" : "Final";
  const errors: string[] = [];
  const get = (name: string) => (f as unknown as Record<string, string | undefined>)[`${side}${name}`];

  const dip = parseDecimalN(get("DipMm"), 2);
  if (!dip.ok) errors.push(`${label} dip: ${dip.message}`);
  const waterDip = parseDecimalN(get("WaterDipMm"), 2);
  if (!waterDip.ok) errors.push(`${label} water dip: ${waterDip.message}`);
  const temperatureC = parseDecimalN(get("TemperatureC"), 2);
  if (!temperatureC.ok) errors.push(`${label} temperature: ${temperatureC.message}`);
  const densityAt20 = parseDecimalN(get("DensityAt20"), 4);
  if (!densityAt20.ok) errors.push(`${label} density: ${densityAt20.message}`);
  const vcf = parseDecimalN(get("Vcf"), 5);
  if (!vcf.ok) errors.push(`${label} VCF: ${vcf.message}`);
  const swPercent = isCrudeOil ? parseDecimalN(get("SwPercent"), 3) : { ok: true as const, value: null };
  if (!swPercent.ok) errors.push(`${label} S&W: ${swPercent.message}`);
  const airBuoyancyOverride = parseDecimal3(get("AirBuoyancyOverrideMt"));
  if (!airBuoyancyOverride.ok) errors.push(`${label} air buoyancy override: ${airBuoyancyOverride.message}`);
  const manualTgv = parseDecimal3(get("ManualTgvL"));
  if (!manualTgv.ok) errors.push(`${label} manual TGV: ${manualTgv.message}`);
  const manualWaterVolume = parseDecimal3(get("ManualWaterVolumeL"));
  if (!manualWaterVolume.ok) errors.push(`${label} manual water volume: ${manualWaterVolume.message}`);
  const manualRoofVolume = parseDecimal3(get("ManualRoofVolumeL"));
  if (!manualRoofVolume.ok) errors.push(`${label} manual roof volume: ${manualRoofVolume.message}`);

  if (errors.length > 0) {
    return { input: {} as ReadingInput, errors };
  }

  const dipNum = numOf(dip);
  const waterDipNum = numOf(waterDip);

  let tgvL = numOf(manualTgv);
  let roofVolumeL = numOf(manualRoofVolume);
  let waterVolumeL = numOf(manualWaterVolume);

  if (dipNum !== null && (tgvL === null || roofVolumeL === null)) {
    const looked = await lookupVolumeForDip(tankId, dipNum);
    if (tgvL === null) tgvL = looked?.tgvL ?? null;
    if (roofVolumeL === null) roofVolumeL = looked?.roofVolumeL ?? null;
  }
  if (waterVolumeL === null) {
    if (waterDipNum === 0) waterVolumeL = 0;
    else if (waterDipNum !== null) waterVolumeL = (await lookupVolumeForDip(tankId, waterDipNum))?.tgvL ?? null;
    else waterVolumeL = 0; // no water dip entered at all -> assume no free water
  }
  if (roofVolumeL === null) roofVolumeL = 0; // no floating roof / no roof data at this dip -> 0 (spec section 4.3)

  if (tgvL === null) {
    errors.push(`${label}: no calibration data covers this dip — enter TGV directly, or calibrate the tank first.`);
  }
  if (waterVolumeL === null) {
    errors.push(`${label}: no calibration data covers the water dip — enter water volume directly.`);
  }

  return {
    input: {
      tankId,
      dipMm: dipNum,
      waterDipMm: waterDipNum,
      tgvL,
      waterVolumeL,
      roofVolumeL,
      temperatureC: numOf(temperatureC),
      densityAt20: numOf(densityAt20),
      densityUnit,
      vcf: numOf(vcf),
      swPercent: numOf(swPercent),
      airBuoyancyOverrideMt: numOf(airBuoyancyOverride),
    },
    errors,
  };
}

/** Loads (or creates) the job's outturn header, using the given movement/crude/density/notes as the latest values. */
async function upsertOutturnHeader(
  jobId: number,
  movementType: "receipt" | "delivery",
  isCrudeOil: boolean,
  densityUnit: "kg_m3" | "g_cm3",
  notes: string | null,
): Promise<number> {
  const database = requireDb();
  const existing = await database.select({ id: jobOutturns.id }).from(jobOutturns).where(eq(jobOutturns.jobId, jobId)).limit(1);
  const values = { movementType, isCrudeOil, densityUnit, notes, updatedAt: new Date() };
  if (existing[0]) {
    await database.update(jobOutturns).set(values).where(eq(jobOutturns.id, existing[0].id));
    return existing[0].id;
  }
  const inserted = await database.insert(jobOutturns).values({ jobId, ...values }).returning({ id: jobOutturns.id });
  return inserted[0].id;
}

/** Recomputes the job-wide outturn totals from every tank row and writes them into jobCompletionData — the actual "feed the existing report fields" step, read unchanged by approval checks and the Certificate of Quantity. */
async function recomputeCompletionFigures(jobId: number): Promise<void> {
  const database = requireDb();
  const headerRows = await database.select().from(jobOutturns).where(eq(jobOutturns.jobId, jobId)).limit(1);
  const header = headerRows[0];
  const tankRows = header ? await database.select().from(jobOutturnTanks).where(eq(jobOutturnTanks.jobOutturnId, header.id)) : [];

  const completionValues =
    header && tankRows.length > 0
      ? (() => {
          const totals = sumOutturnTotals(header, tankRows);
          return {
            gov: round3(totals.govOutturnL),
            gsv: round3(totals.volumeOutturnL),
            metricTonnesAir: round3(totals.mtAirOutturn),
            metricTonnesVacuum: round3(totals.mtVacOutturn),
          };
        })()
      : { gov: null, gsv: null, metricTonnesAir: null, metricTonnesVacuum: null };

  const existingCompletion = await database.select({ id: jobCompletionData.id }).from(jobCompletionData).where(eq(jobCompletionData.jobId, jobId)).limit(1);
  if (existingCompletion[0]) {
    await database.update(jobCompletionData).set({ ...completionValues, updatedAt: new Date() }).where(eq(jobCompletionData.id, existingCompletion[0].id));
  } else {
    await database.insert(jobCompletionData).values({ jobId, ...completionValues });
  }
}

/** Adds a new tank to the job's outturn, or updates one (when tankRowId is given). One job can cover several tanks (e.g. a vessel discharging into 3 tanks at once) — the report shows one column-pair per tank plus a summed total. */
export async function saveOutturnData(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = outturnSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Check the fields entered.");
  const f = parsed.data;
  const job = await loadOwnJob(f.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");
  if (!["inspector_accepted", "in_progress", "rejected_amendment"].includes(job.status)) {
    return initialFail("This job isn't open for outturn data right now.");
  }

  const validTanks = await requireDb().select({ id: tanks.id }).from(tanks).where(eq(tanks.clientId, job.clientId));
  const validTankIds = new Set(validTanks.map((t) => t.id));
  if (!validTankIds.has(f.initialTankId)) return initialFail("Initial tank: pick a tank that belongs to this client.");
  if (!validTankIds.has(f.finalTankId)) return initialFail("Final tank: pick a tank that belongs to this client.");

  const isCrudeOil = f.isCrudeOil === "on";
  const [initialPrep, finalPrep] = await Promise.all([
    prepareSide("initial", f, f.initialTankId, f.densityUnit, isCrudeOil),
    prepareSide("final", f, f.finalTankId, f.densityUnit, isCrudeOil),
  ]);
  const prepErrors = [...initialPrep.errors, ...finalPrep.errors];
  if (prepErrors.length > 0) return initialFail(prepErrors[0]);

  const initialEval = calculateReading(initialPrep.input, "Initial");
  const finalEval = calculateReading(finalPrep.input, "Final");
  const blocking = [...initialEval.blockingErrors, ...finalEval.blockingErrors];
  if (blocking.length > 0 || !initialEval.result || !finalEval.result) {
    return initialFail(blocking[0] ?? "Couldn't calculate the outturn.");
  }

  const tankCapacityRows = await requireDb()
    .select({ id: tanks.id, capacity: tanks.capacity, capacityUnit: tanks.capacityUnit })
    .from(tanks)
    .where(eq(tanks.id, f.initialTankId))
    .limit(1);
  const capacityL =
    tankCapacityRows[0]?.capacity && tankCapacityRows[0].capacityUnit === "L" ? Number(tankCapacityRows[0].capacity) : null;

  const outturn = calculateOutturn(
    { ...initialPrep.input, result: initialEval.result },
    { ...finalPrep.input, result: finalEval.result },
    f.movementType as MovementType,
    capacityL,
  );

  const database = requireDb();
  const headerId = await upsertOutturnHeader(f.jobId, f.movementType, isCrudeOil, f.densityUnit, f.notes || null);

  const toStrN = (n: number | null, scale: number) => (n === null ? null : n.toFixed(scale));
  const tankValues = {
    initialTankId: f.initialTankId,
    initialDipMm: toStrN(initialPrep.input.dipMm, 2),
    initialWaterDipMm: toStrN(initialPrep.input.waterDipMm, 2),
    initialTemperatureC: toStrN(initialPrep.input.temperatureC, 2),
    initialDensityAt20: toStrN(initialPrep.input.densityAt20, 4),
    initialVcf: toStrN(initialPrep.input.vcf, 5),
    initialTgvL: toStrN(initialPrep.input.tgvL, 3),
    initialWaterVolumeL: toStrN(initialPrep.input.waterVolumeL, 3),
    initialRoofVolumeL: toStrN(initialPrep.input.roofVolumeL, 3),
    initialSwPercent: toStrN(initialPrep.input.swPercent, 3),
    initialAirBuoyancyOverrideMt: toStrN(initialPrep.input.airBuoyancyOverrideMt, 3),
    finalTankId: f.finalTankId,
    finalDipMm: toStrN(finalPrep.input.dipMm, 2),
    finalWaterDipMm: toStrN(finalPrep.input.waterDipMm, 2),
    finalTemperatureC: toStrN(finalPrep.input.temperatureC, 2),
    finalDensityAt20: toStrN(finalPrep.input.densityAt20, 4),
    finalVcf: toStrN(finalPrep.input.vcf, 5),
    finalTgvL: toStrN(finalPrep.input.tgvL, 3),
    finalWaterVolumeL: toStrN(finalPrep.input.waterVolumeL, 3),
    finalRoofVolumeL: toStrN(finalPrep.input.roofVolumeL, 3),
    finalSwPercent: toStrN(finalPrep.input.swPercent, 3),
    finalAirBuoyancyOverrideMt: toStrN(finalPrep.input.airBuoyancyOverrideMt, 3),
    updatedAt: new Date(),
  };

  if (f.tankRowId) {
    const owned = await database
      .select({ id: jobOutturnTanks.id })
      .from(jobOutturnTanks)
      .where(and(eq(jobOutturnTanks.id, f.tankRowId), eq(jobOutturnTanks.jobOutturnId, headerId)))
      .limit(1);
    if (!owned[0]) return initialFail("That tank entry no longer exists.");
    await database.update(jobOutturnTanks).set(tankValues).where(eq(jobOutturnTanks.id, f.tankRowId));
  } else {
    await database.insert(jobOutturnTanks).values({ jobOutturnId: headerId, ...tankValues });
  }

  await recomputeCompletionFigures(f.jobId);
  revalidateJob(f.jobId);
  const warnings = [...initialEval.warnings, ...finalEval.warnings, ...outturn.warnings];
  return {
    ok: true,
    message: warnings.length > 0 ? `Tank saved, with ${warnings.length} warning(s) — see the trail below.` : "Tank saved.",
  };
}

/** Removes one tank from the job's outturn and recomputes the job-wide totals. */
export async function removeOutturnTankReading(formData: FormData): Promise<void> {
  const inspector = await getInspector();
  if (!inspector) return;
  const jobId = Number(formData.get("jobId"));
  const tankRowId = Number(formData.get("tankRowId"));
  if (!jobId || !tankRowId) return;
  const job = await loadOwnJob(jobId, inspector.id);
  if (!job) return;

  const database = requireDb();
  const headerRows = await database.select({ id: jobOutturns.id }).from(jobOutturns).where(eq(jobOutturns.jobId, jobId)).limit(1);
  const header = headerRows[0];
  if (!header) return;
  await database.delete(jobOutturnTanks).where(and(eq(jobOutturnTanks.id, tankRowId), eq(jobOutturnTanks.jobOutturnId, header.id)));

  await recomputeCompletionFigures(jobId);
  revalidateJob(jobId);
}

/* ---------------- Stock readings (section 14, stock monitoring jobs only) ---------------- */

const stockReadingSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  tankId: z.coerce.number().int().positive(),
  readingDate: z.string().min(1, "Pick a date."),
  openingStock: z.string().optional(),
  receipts: z.string().optional(),
  transfers: z.string().optional(),
  dischargesLoads: z.string().optional(),
  closingStock: z.string().optional(),
  gsv: z.string().optional(),
  dipHeightMm: z.string().optional(),
  temperatureC: z.string().optional(),
  densityAt20: z.string().optional(),
  vcf: z.string().optional(),
  gov: z.string().optional(),
  netWeightAir: z.string().optional(),
  netWeightVacuum: z.string().optional(),
  pumpableStock: z.string().optional(),
  statusRemark: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function addStockReading(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = stockReadingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Check the fields entered.");
  const f = parsed.data;
  const job = await loadOwnJob(f.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");
  if (job.serviceType !== "stock_monitoring") {
    return initialFail("Stock readings are only for Stock Monitoring jobs.");
  }

  const fields = [
    ["openingStock", f.openingStock] as const,
    ["receipts", f.receipts] as const,
    ["transfers", f.transfers] as const,
    ["dischargesLoads", f.dischargesLoads] as const,
    ["closingStock", f.closingStock] as const,
    ["gsv", f.gsv] as const,
    ["dipHeightMm", f.dipHeightMm] as const,
    ["gov", f.gov] as const,
    ["netWeightAir", f.netWeightAir] as const,
    ["netWeightVacuum", f.netWeightVacuum] as const,
    ["pumpableStock", f.pumpableStock] as const,
  ];
  const parsedValues: Record<string, string | null> = {};
  for (const [key, raw] of fields) {
    const result = parseDecimal3(raw);
    if (!result.ok) return initialFail(`${key}: ${result.message}`);
    parsedValues[key] = result.value;
  }

  const temperatureC = parseDecimalN(f.temperatureC, 2);
  if (!temperatureC.ok) return initialFail(`temperatureC: ${temperatureC.message}`);
  const densityAt20 = parseDecimalN(f.densityAt20, 4);
  if (!densityAt20.ok) return initialFail(`densityAt20: ${densityAt20.message}`);
  const vcf = parseDecimalN(f.vcf, 5);
  if (!vcf.ok) return initialFail(`vcf: ${vcf.message}`);

  await requireDb().insert(stockReadings).values({
    jobId: f.jobId,
    tankId: f.tankId,
    readingDate: new Date(f.readingDate),
    openingStock: parsedValues.openingStock,
    receipts: parsedValues.receipts,
    transfers: parsedValues.transfers,
    dischargesLoads: parsedValues.dischargesLoads,
    closingStock: parsedValues.closingStock,
    gsv: parsedValues.gsv,
    dipHeightMm: parsedValues.dipHeightMm,
    temperatureC: temperatureC.value,
    densityAt20: densityAt20.value,
    vcf: vcf.value,
    gov: parsedValues.gov,
    netWeightAir: parsedValues.netWeightAir,
    netWeightVacuum: parsedValues.netWeightVacuum,
    pumpableStock: parsedValues.pumpableStock,
    statusRemark: f.statusRemark || null,
    notes: f.notes || null,
    recordedByInspectorId: inspector.id,
  });

  revalidatePath(`/inspector/jobs/${f.jobId}`);
  revalidatePath(`/admin/jobs/${f.jobId}`);
  return { ok: true, message: "Stock reading logged." };
}

/* ---------------- Documents ---------------- */

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const inspectorDocSchema = z.object({
  jobId: z.coerce.number().int().positive(),
  kind: z.enum(["report", "other"]),
  title: z.string().trim().min(1).max(200),
});

export async function addInspectorDocument(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = inspectorDocSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Provide a title and a file.");
  const f = parsed.data;
  const job = await loadOwnJob(f.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return initialFail("Attach a file.");
  if (file.size > MAX_UPLOAD_BYTES) return initialFail("File is larger than 4 MB.");

  const buf = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const fileData = `data:${mimeType};base64,${buf.toString("base64")}`;

  const database = requireDb();
  let insertedId: number | null = null;
  try {
    const inserted = await database
      .insert(documents)
      .values({ jobId: f.jobId, kind: f.kind, title: f.title, fileData, mimeType })
      .returning({ id: documents.id });
    insertedId = inserted[0]?.id ?? null;
  } catch (err) {
    console.error("addInspectorDocument:", err);
    return initialFail("Could not save document.");
  }

  if (insertedId) {
    await reviewUploadedFile({
      jobId: f.jobId,
      jobRef: job.ref,
      targetType: "document",
      targetId: insertedId,
      fileDataUrl: fileData,
      context: `Document type: ${f.kind}. Title: "${f.title}". Uploaded by inspector ${inspector.name}.`,
    });
  }

  const recipient = await database
    .select({ email: clients.email, ref: jobs.ref, clientId: jobs.clientId })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(jobs.id, job.id))
    .limit(1);
  if (recipient[0]) {
    const title = `New document available on job ${recipient[0].ref}`;
    const body = `${f.title} has been added to your job.`;
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient[0].clientId,
      email: recipient[0].email,
      jobId: job.id,
      type: "document_added",
      title,
      body,
      link: `/portal/jobs/${job.id}`,
      emailSubject: title,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE CLIENT PORTAL",
        heading: title,
        bodyLines: [body, "Sign in to the portal to download it."],
        ctaUrl: "https://jdlcore.com/portal",
        ctaLabel: "Open the portal",
        footer: `Job reference: ${recipient[0].ref}`,
      }),
    });
  }

  revalidateJob(f.jobId);
  return { ok: true, message: "Document uploaded." };
}

/* ---------------- Submit / amend ---------------- */

export async function submitForApproval(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid job.");
  const job = await loadOwnJob(parsed.data.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");

  const actor: Actor = { type: "inspector", id: inspector.id, name: inspector.name };
  if (!canTransition(job.status as JobStatus, "awaiting_approval", actor)) {
    return initialFail("This job isn't ready to submit.");
  }

  const database = requireDb();
  const completion = await database
    .select({ id: jobCompletionData.id })
    .from(jobCompletionData)
    .where(eq(jobCompletionData.jobId, job.id))
    .limit(1);
  if (!completion[0]) return initialFail("Enter completion data before submitting.");

  const now = new Date();
  await database.update(jobs).set({ status: "awaiting_approval", updatedAt: now }).where(eq(jobs.id, job.id));
  await database.update(jobCompletionData).set({ submittedAt: now }).where(eq(jobCompletionData.jobId, job.id));
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: "awaiting_approval",
    note: `Submitted for approval by ${inspector.name}.`,
    actorType: "inspector",
    actorId: inspector.id,
    actorName: inspector.name,
  });

  await triggerCompletionReview(job);
  await recordApprovalCheck(job.id);

  const recipient = await database
    .select({ email: clients.email, ref: jobs.ref, clientId: jobs.clientId })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(jobs.id, job.id))
    .limit(1);
  if (recipient[0]) {
    const title = `Job completed — ${recipient[0].ref}`;
    const body = "The inspector has completed the work and it's now under Operations review.";
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient[0].clientId,
      email: recipient[0].email,
      jobId: job.id,
      type: "job_completed",
      title,
      body,
      link: `/portal/jobs/${job.id}`,
      emailSubject: title,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE CLIENT PORTAL",
        heading: title,
        bodyLines: [body],
        ctaUrl: "https://jdlcore.com/portal",
        ctaLabel: "Open the portal",
        footer: `Job reference: ${recipient[0].ref}`,
      }),
    });
  }
  await notifyOperationsRole(job.ref, "Report awaiting approval", undefined, job.id);

  revalidateJob(job.id);
  return { ok: true, message: "Submitted to Operations for approval." };
}

export async function amendAndResubmit(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = jobIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid job.");
  const job = await loadOwnJob(parsed.data.jobId, inspector.id);
  if (!job) return initialFail("Job not found.");
  if (job.status !== "rejected_amendment") return initialFail("This job isn't awaiting amendment.");

  const database = requireDb();
  const now = new Date();
  await database.update(jobs).set({ status: "awaiting_approval", updatedAt: now }).where(eq(jobs.id, job.id));
  await database.update(jobCompletionData).set({ submittedAt: now }).where(eq(jobCompletionData.jobId, job.id));
  await database.insert(jobUpdates).values({
    jobId: job.id,
    status: "awaiting_approval",
    note: `Amended and resubmitted by ${inspector.name}.`,
    actorType: "inspector",
    actorId: inspector.id,
    actorName: inspector.name,
  });

  await triggerCompletionReview(job);
  await recordApprovalCheck(job.id);

  const recipient = await database
    .select({ email: clients.email, ref: jobs.ref, clientId: jobs.clientId })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(jobs.id, job.id))
    .limit(1);
  if (recipient[0]) {
    const title = `Amended report resubmitted — ${recipient[0].ref}`;
    const body = "Your amended inspection report has been resubmitted and is now under Operations review.";
    await notifyBoth({
      recipientType: "client",
      recipientId: recipient[0].clientId,
      email: recipient[0].email,
      jobId: job.id,
      type: "job_resubmitted",
      title,
      body,
      link: `/portal/jobs/${job.id}`,
      emailSubject: title,
      emailHtml: brandedEmailHtml({
        label: "JDL CORE CLIENT PORTAL",
        heading: title,
        bodyLines: [body],
        ctaUrl: "https://jdlcore.com/portal",
        ctaLabel: "Open the portal",
        footer: `Job reference: ${recipient[0].ref}`,
      }),
    });
  }
  await notifyOperationsRole(job.ref, `Amended report resubmitted for ${job.ref}`, undefined, job.id);

  revalidateJob(job.id);
  return { ok: true, message: "Resubmitted to Operations." };
}

/* ---------------- Availability (used by automatic assignment) ---------------- */

const availabilitySchema = z.object({
  awayUntil: z.string().optional(),
  back: z.string().optional(),
});

/**
 * Lets an inspector mark themselves away until a date (leave, travel), or available again, so
 * automatic assignment doesn't give them new jobs meanwhile. Only touches their own availability;
 * everything else in their assignment profile stays with the administrators.
 */
export async function setMyAvailability(_prev: FormState, formData: FormData): Promise<FormState> {
  const inspector = await getInspector();
  if (!inspector) return initialFail("Unauthorized");
  const parsed = availabilitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Check the date entered.");

  let until: Date | null = null;
  if (!parsed.data.back) {
    if (!parsed.data.awayUntil) return initialFail("Pick the date you will be back.");
    until = new Date(`${parsed.data.awayUntil}T00:00:00.000Z`);
    if (Number.isNaN(until.getTime())) return initialFail("That date isn't valid.");
    if (until.getTime() <= Date.now()) return initialFail("Pick a date in the future, or choose \"I'm available now\".");
  }

  try {
    await requireDb()
      .insert(inspectorAssignmentProfiles)
      .values({ inspectorId: inspector.id, unavailableUntil: until })
      .onConflictDoUpdate({
        target: inspectorAssignmentProfiles.inspectorId,
        set: { unavailableUntil: until, updatedAt: new Date() },
      });
  } catch (err) {
    console.error("setMyAvailability:", err);
    return initialFail("Could not save. Please try again.");
  }
  revalidatePath("/inspector");
  return {
    ok: true,
    message: until
      ? `Marked as away until ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(until)}.`
      : "You're available for new assignments.",
  };
}
