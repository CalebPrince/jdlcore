import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requireDb } from "@/db";
import {
  clients,
  documents,
  jobCompletionData,
  jobOutturns,
  jobOutturnTanks,
  jobUpdates,
  jobs,
  stockReadings,
  tanks,
  type StockReading,
} from "@/db/schema";
import { getInspector } from "@/lib/inspector-auth";
import { JOB_STATUS_META, SERVICE_TYPE_LABEL, type JobStatus, type ServiceType } from "@/lib/jobs";
import { buildOutturnTrail, type OutturnTankRow } from "@/lib/outturn-trail";
import { lookupVolumeForDip } from "@/lib/tank-calibration";
import {
  AcceptDeclineForms,
  AmendResubmitForm,
  CompletionDataForm,
  ProgressUpdateForm,
  StockReadingForm,
  type StockReadingDefaults,
  SubmitForApprovalForm,
  UploadDocumentForm,
} from "@/components/inspector/inspector-job-forms";
import { OutturnForm, type OutturnDefaults } from "@/components/inspector/outturn-form";
import { OutturnTrailDisplay } from "@/components/inspector/outturn-trail-display";
import { OutturnSummaryCard, OutturnTanksList } from "@/components/inspector/outturn-summary";
import { JobChat } from "@/components/chat/job-chat";
import { listJobMessages } from "@/lib/job-chat";
import { StockReadingsList } from "@/components/inspector/stock-readings-list";
import { StockSheetImport } from "@/components/stock/stock-sheet-import";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const EDITABLE_STATUSES = ["inspector_accepted", "in_progress", "rejected_amendment"];
const STOCK_READINGS_SHOWN = 60;

const fixed3 = (n: number) => n.toFixed(3);

/**
 * The saved TGV/water/roof volumes that did NOT come from the tank's calibration table, so the edit
 * form can put them back in the manual-override fields. Without this, re-saving a tank that was
 * entered with manual figures would fail (or silently swap them for a calibration lookup).
 */
async function manualOverridesFor(row: OutturnTankRow, side: "initial" | "final") {
  const tankId = row[`${side}TankId`];
  const dip = row[`${side}DipMm`];
  const waterDip = row[`${side}WaterDipMm`];
  const tgv = row[`${side}TgvL`];
  const water = row[`${side}WaterVolumeL`];
  const roof = row[`${side}RoofVolumeL`];

  const looked = dip !== null ? await lookupVolumeForDip(tankId, Number(dip)) : null;
  const expectedTgv = looked ? fixed3(looked.tgvL) : null;
  const expectedRoof = fixed3(looked?.roofVolumeL ?? 0);
  let expectedWater: string | null = fixed3(0);
  if (waterDip !== null && Number(waterDip) !== 0) {
    const lookedWater = await lookupVolumeForDip(tankId, Number(waterDip));
    expectedWater = lookedWater ? fixed3(lookedWater.tgvL) : null;
  }

  return {
    tgv: tgv !== null && tgv !== expectedTgv ? tgv : null,
    water: water !== null && water !== expectedWater ? water : null,
    roof: roof !== null && roof !== expectedRoof ? roof : null,
  };
}

export default async function InspectorJobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editOutturnTank?: string; editStockReading?: string }>;
}) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isInteger(jobId)) notFound();
  const { editOutturnTank, editStockReading } = await searchParams;

  const inspector = await getInspector();
  if (!inspector) return null;

  const database = requireDb();
  const rows = await database
    .select({ job: jobs, client: clients })
    .from(jobs)
    .innerJoin(clients, eq(jobs.clientId, clients.id))
    .where(eq(jobs.id, jobId))
    .limit(1);
  if (!rows[0] || rows[0].job.assignedInspectorId !== inspector.id) notFound();
  const job = rows[0].job;
  const client = rows[0].client;

  const [timeline, completion, tankList, outturnHeaderRows] = await Promise.all([
    database.select().from(jobUpdates).where(eq(jobUpdates.jobId, jobId)).orderBy(asc(jobUpdates.createdAt)),
    database.select().from(jobCompletionData).where(eq(jobCompletionData.jobId, jobId)).limit(1),
    database.select().from(tanks).where(eq(tanks.clientId, job.clientId)),
    database.select().from(jobOutturns).where(eq(jobOutturns.jobId, jobId)).limit(1),
  ]);

  const chatMessages = await listJobMessages(jobId);
  const jobDocs = await database
    .select({ id: documents.id, title: documents.title, fileName: documents.fileName, createdAt: documents.createdAt })
    .from(documents)
    .where(eq(documents.jobId, jobId))
    .orderBy(desc(documents.createdAt));

  const meta = JOB_STATUS_META[job.status as JobStatus] ?? JOB_STATUS_META.assigned;
  const cd = completion[0];
  const outturnHeader = outturnHeaderRows[0];
  const outturnTankRows = outturnHeader
    ? await database.select().from(jobOutturnTanks).where(eq(jobOutturnTanks.jobOutturnId, outturnHeader.id))
    : [];
  const tankNames = new Map(tankList.map((t) => [t.id, t.name]));
  const lastRejection = [...timeline].reverse().find((u) => u.status === "rejected_amendment");

  const editable = EDITABLE_STATUSES.includes(job.status);

  const editingTankRow =
    editable && editOutturnTank ? outturnTankRows.find((t) => t.id === Number(editOutturnTank)) : undefined;
  const [initialManual, finalManual] = editingTankRow
    ? await Promise.all([manualOverridesFor(editingTankRow, "initial"), manualOverridesFor(editingTankRow, "final")])
    : [null, null];
  const editingTankName = editingTankRow
    ? (tankNames.get(editingTankRow.initialTankId) ?? `Tank #${editingTankRow.initialTankId}`)
    : null;

  const isStockJob = job.serviceType === "stock_monitoring";
  let stockRows: StockReading[] = [];
  let stockCount = 0;
  let editingReading: StockReading | undefined;
  if (isStockJob) {
    stockRows = await database
      .select()
      .from(stockReadings)
      .where(eq(stockReadings.jobId, jobId))
      .orderBy(desc(stockReadings.readingDate), desc(stockReadings.id))
      .limit(STOCK_READINGS_SHOWN);
    const countRows = await database
      .select({ n: sql<number>`count(*)::int` })
      .from(stockReadings)
      .where(eq(stockReadings.jobId, jobId));
    stockCount = countRows[0]?.n ?? stockRows.length;
    const editingId = Number(editStockReading);
    if (editable && Number.isInteger(editingId) && editingId > 0) {
      editingReading =
        stockRows.find((r) => r.id === editingId) ??
        (
          await database
            .select()
            .from(stockReadings)
            .where(and(eq(stockReadings.id, editingId), eq(stockReadings.jobId, jobId)))
            .limit(1)
        )[0];
    }
  }
  const stockDefaults: StockReadingDefaults | undefined = editingReading
    ? {
        tankId: String(editingReading.tankId),
        readingDate: new Date(editingReading.readingDate).toISOString().slice(0, 10),
        openingStock: editingReading.openingStock,
        receipts: editingReading.receipts,
        transfers: editingReading.transfers,
        dischargesLoads: editingReading.dischargesLoads,
        closingStock: editingReading.closingStock,
        gsv: editingReading.gsv,
        dipHeightMm: editingReading.dipHeightMm,
        temperatureC: editingReading.temperatureC,
        densityAt20: editingReading.densityAt20,
        vcf: editingReading.vcf,
        gov: editingReading.gov,
        netWeightAir: editingReading.netWeightAir,
        netWeightVacuum: editingReading.netWeightVacuum,
        pumpableStock: editingReading.pumpableStock,
        statusRemark: editingReading.statusRemark,
        notes: editingReading.notes,
      }
    : undefined;

  const outturnDefaults: OutturnDefaults = {
    movementType: (outturnHeader?.movementType as "receipt" | "delivery" | undefined) ?? null,
    isCrudeOil: outturnHeader?.isCrudeOil ?? false,
    densityUnit: (outturnHeader?.densityUnit as "kg_m3" | "g_cm3" | undefined) ?? "kg_m3",
    notes: outturnHeader?.notes ?? null,
    initialTankId: editingTankRow?.initialTankId ?? null,
    finalTankId: editingTankRow?.finalTankId ?? null,
    initialDipMm: editingTankRow?.initialDipMm ?? null,
    initialWaterDipMm: editingTankRow?.initialWaterDipMm ?? null,
    initialTemperatureC: editingTankRow?.initialTemperatureC ?? null,
    initialDensityAt20: editingTankRow?.initialDensityAt20 ?? null,
    initialVcf: editingTankRow?.initialVcf ?? null,
    initialSwPercent: editingTankRow?.initialSwPercent ?? null,
    finalDipMm: editingTankRow?.finalDipMm ?? null,
    finalWaterDipMm: editingTankRow?.finalWaterDipMm ?? null,
    finalTemperatureC: editingTankRow?.finalTemperatureC ?? null,
    finalDensityAt20: editingTankRow?.finalDensityAt20 ?? null,
    finalVcf: editingTankRow?.finalVcf ?? null,
    finalSwPercent: editingTankRow?.finalSwPercent ?? null,
    initialManualTgvL: initialManual?.tgv ?? null,
    initialManualWaterVolumeL: initialManual?.water ?? null,
    initialManualRoofVolumeL: initialManual?.roof ?? null,
    initialAirBuoyancyOverrideMt: editingTankRow?.initialAirBuoyancyOverrideMt ?? null,
    finalManualTgvL: finalManual?.tgv ?? null,
    finalManualWaterVolumeL: finalManual?.water ?? null,
    finalManualRoofVolumeL: finalManual?.roof ?? null,
    finalAirBuoyancyOverrideMt: editingTankRow?.finalAirBuoyancyOverrideMt ?? null,
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/inspector"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gold-600"
      >
        <ArrowLeft className="h-4 w-4" /> My Jobs
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-display text-sm font-bold tracking-wide text-gold-700">{job.ref}</span>
          <Badge variant="secondary" className={meta.badgeClass}>
            {meta.label}
          </Badge>
          {job.serviceType && (
            <Badge variant="outline">{SERVICE_TYPE_LABEL[job.serviceType as ServiceType] ?? job.serviceType}</Badge>
          )}
        </div>
        <h1 className="mb-1 mt-2 font-display text-xl font-bold text-navy-950">
          {job.service}
          {job.location ? ` — ${job.location}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {client.name}
          {client.company ? ` · ${client.company}` : ""} · Opened {dateFmt.format(new Date(job.createdAt))}
        </p>
      </div>

      {job.status === "rejected_amendment" && lastRejection?.note && (
        <div className="rounded-[var(--radius)] border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="m-0 font-semibold">Operations returned this job for amendment:</p>
          <p className="m-0 mt-1">{lastRejection.note}</p>
        </div>
      )}

      {job.status === "assigned" && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Accept This Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <AcceptDeclineForms jobId={job.id} />
          </CardContent>
        </Card>
      )}

      {(job.status === "inspector_accepted" || job.status === "in_progress") && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Progress Updates</CardTitle>
          </CardHeader>
          <CardContent>
            <ProgressUpdateForm jobId={job.id} />
          </CardContent>
        </Card>
      )}

      {(editable || (outturnHeader && outturnTankRows.length > 0)) && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Product Outturn</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {!editable && (
              <p className="m-0 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                {job.status === "awaiting_approval"
                  ? "These figures are with Operations for review and can't be changed right now. If something is wrong, ask Operations to return the job for amendment."
                  : "These figures are final and can no longer be changed."}
              </p>
            )}
            {outturnHeader && (
              <OutturnTanksList
                jobId={job.id}
                header={outturnHeader}
                tankRows={outturnTankRows}
                tankNames={tankNames}
                editable={editable}
              />
            )}
            {editable && (
              <div id="outturn-form" className="flex scroll-mt-24 flex-col gap-3">
                <p className="m-0 text-sm font-semibold text-navy-950">
                  {editingTankName ? `Editing ${editingTankName}` : "Add a tank"}
                </p>
                {/* Keyed so the fields reload with the chosen tank's saved figures when Edit is clicked. */}
                <OutturnForm
                  key={editingTankRow?.id ?? "new"}
                  jobId={job.id}
                  tanks={tankList}
                  defaults={outturnDefaults}
                  editingTankRowId={editingTankRow?.id}
                  cancelEditHref={`/inspector/jobs/${job.id}`}
                />
              </div>
            )}
            {outturnHeader && outturnTankRows.length > 0 && (
              <>
                {outturnTankRows.map((t) => (
                  <OutturnTrailDisplay key={t.id} trail={buildOutturnTrail(outturnHeader, t)} />
                ))}
                <OutturnSummaryCard header={outturnHeader} tankRows={outturnTankRows} tankNames={tankNames} />
              </>
            )}
          </CardContent>
        </Card>
      )}

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Completion Data</CardTitle>
          </CardHeader>
          <CardContent>
            <CompletionDataForm
              jobId={job.id}
              defaultValues={
                cd
                  ? {
                      dateTimeStarted: cd.dateTimeStarted
                        ? new Date(cd.dateTimeStarted).toISOString().slice(0, 16)
                        : null,
                      dateTimeCompleted: cd.dateTimeCompleted
                        ? new Date(cd.dateTimeCompleted).toISOString().slice(0, 16)
                        : null,
                      service: cd.service,
                      inspectorComments: cd.inspectorComments,
                    }
                  : undefined
              }
              computedFigures={
                cd
                  ? {
                      gov: cd.gov,
                      gsv: cd.gsv,
                      metricTonnesAir: cd.metricTonnesAir,
                      metricTonnesVacuum: cd.metricTonnesVacuum,
                    }
                  : undefined
              }
            />
          </CardContent>
        </Card>
      )}

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Documents</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {jobDocs.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {jobDocs.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-sm font-medium text-navy-950">{d.title}</p>
                      <p className="m-0 truncate text-xs text-muted-foreground">
                        {d.fileName ? `${d.fileName} · ` : ""}
                        {dateFmt.format(new Date(d.createdAt))}
                      </p>
                    </div>
                    <a
                      href={`/api/portal/documents/${d.id}`}
                      className="shrink-0 text-xs font-semibold text-navy-700 underline-offset-2 hover:underline"
                    >
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <UploadDocumentForm jobId={job.id} />
          </CardContent>
        </Card>
      )}

      {isStockJob && (editable || stockRows.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Stock Readings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <StockReadingsList
              jobId={job.id}
              readings={stockRows}
              totalCount={stockCount}
              tankNames={tankNames}
              editable={editable}
              editingReadingId={editingReading?.id}
            />
            {editable && (
              <>
                <details className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
                  <summary className="cursor-pointer text-sm font-semibold text-navy-950">
                    Import from stock sheet
                  </summary>
                  <div className="mt-3">
                    <StockSheetImport jobId={job.id} tanks={tankList} />
                  </div>
                </details>
                <div id="stock-reading-form" className="flex scroll-mt-24 flex-col gap-3">
                  <p className="m-0 text-sm font-semibold text-navy-950">
                    {editingReading
                      ? `Editing the reading for ${tankNames.get(editingReading.tankId) ?? `Tank #${editingReading.tankId}`}`
                      : "Log a reading"}
                  </p>
                  <StockReadingForm
                    key={editingReading?.id ?? "new"}
                    jobId={job.id}
                    tanks={tankList}
                    defaults={stockDefaults}
                    editingReadingId={editingReading?.id}
                    cancelEditHref={`/inspector/jobs/${job.id}`}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {(job.status === "inspector_accepted" || job.status === "in_progress") && (
        <Card>
          <CardContent className="pt-6">
            <SubmitForApprovalForm jobId={job.id} />
          </CardContent>
        </Card>
      )}

      {job.status === "rejected_amendment" && (
        <Card>
          <CardContent className="pt-6">
            <AmendResubmitForm jobId={job.id} />
          </CardContent>
        </Card>
      )}

      <Card id="chat" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="font-display">Group Chat</CardTitle>
        </CardHeader>
        <CardContent>
          <JobChat
            jobId={job.id}
            viewerRole="inspector"
            viewerId={inspector.id}
            initialMessages={chatMessages}
            participantsNote={`Shared with the client (${client.name}) and JDL Core Operations. Both see everything posted here.`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Job History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol
            className="relative m-0 list-none border-l-2 pl-6"
            style={{ borderColor: "rgba(201,142,18,0.35)" }}
          >
            {[...timeline].reverse().map((u, i) => {
              const um = JOB_STATUS_META[u.status as JobStatus] ?? JOB_STATUS_META.assigned;
              return (
                <li key={u.id} className="relative pb-6 last:pb-0">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                      i === 0 ? "bg-gold-600" : "bg-navy-300"
                    }`}
                    style={{ boxShadow: "0 0 0 1px rgba(201,142,18,0.35)" }}
                  />
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-sm font-bold text-navy-950">{um.label}</span>
                    <span className="text-xs text-ink-faint">{dateTimeFmt.format(new Date(u.createdAt))}</span>
                  </div>
                  {u.note && <p className="mb-0 mt-1 text-sm text-ink-soft">{u.note}</p>}
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
