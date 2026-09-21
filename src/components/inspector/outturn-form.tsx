"use client";

import { useActionState, useState } from "react";
import { saveOutturnData } from "@/app/actions/inspector";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/app/actions/submissions";

const initial: FormState = { ok: false, message: "" };

type Tank = { id: number; name: string; hasFloatingRoof: boolean };

export type OutturnDefaults = {
  movementType: "receipt" | "delivery" | null;
  isCrudeOil: boolean;
  densityUnit: "kg_m3" | "g_cm3";
  initialTankId: number | null;
  finalTankId: number | null;
  initialDipMm: string | null;
  initialWaterDipMm: string | null;
  initialTemperatureC: string | null;
  initialDensityAt20: string | null;
  initialVcf: string | null;
  initialSwPercent: string | null;
  finalDipMm: string | null;
  finalWaterDipMm: string | null;
  finalTemperatureC: string | null;
  finalDensityAt20: string | null;
  finalVcf: string | null;
  finalSwPercent: string | null;
};

function Field({
  id,
  label,
  name,
  defaultValue,
  step = "0.001",
  placeholder,
}: {
  id: string;
  label: string;
  name: string;
  defaultValue?: string | null;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type="number" step={step} defaultValue={defaultValue ?? undefined} placeholder={placeholder} />
    </div>
  );
}

function ReadingSection({
  jobId,
  side,
  title,
  tanks,
  defaultTankId,
  isCrudeOil,
  defaults,
}: {
  jobId: number;
  side: "initial" | "final";
  title: string;
  tanks: Tank[];
  defaultTankId: number | null;
  isCrudeOil: boolean;
  defaults: OutturnDefaults;
}) {
  const p = (name: string) => `${side}${name}`;
  const id = (name: string) => `ot-${side}-${name}-${jobId}`;
  const d = defaults as unknown as Record<string, string | null>;

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
      <p className="m-0 text-sm font-semibold text-navy-950">{title}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("tank")}>Tank</Label>
          <select
            id={id("tank")}
            name={p("TankId")}
            required
            defaultValue={defaultTankId ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">Select a tank…</option>
            {tanks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.hasFloatingRoof ? " (floating roof)" : ""}
              </option>
            ))}
          </select>
        </div>
        <Field id={id("dip")} label="Dip (mm)" name={p("DipMm")} step="0.01" defaultValue={d[`${side}DipMm`]} />
        <Field id={id("waterdip")} label="Water dip (mm)" name={p("WaterDipMm")} step="0.01" defaultValue={d[`${side}WaterDipMm`]} placeholder="0" />
        <Field id={id("temp")} label="Temperature (°C)" name={p("TemperatureC")} step="0.01" defaultValue={d[`${side}TemperatureC`]} />
        <Field id={id("density")} label="Density @ 20°C" name={p("DensityAt20")} step="0.0001" defaultValue={d[`${side}DensityAt20`]} />
        <Field id={id("vcf")} label="VCF" name={p("Vcf")} step="0.00001" defaultValue={d[`${side}Vcf`]} />
        {isCrudeOil && <Field id={id("sw")} label="S&W (%)" name={p("SwPercent")} step="0.001" defaultValue={d[`${side}SwPercent`]} placeholder="0" />}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">
          Manual overrides (only if the tank isn&apos;t calibrated for this dip yet, or a reference gives a different figure)
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field id={id("mtgv")} label="TGV, entered directly (L)" name={p("ManualTgvL")} />
          <Field id={id("mwater")} label="Water volume, entered directly (L)" name={p("ManualWaterVolumeL")} />
          <Field id={id("mroof")} label="Roof volume, entered directly (L)" name={p("ManualRoofVolumeL")} />
          <Field id={id("mair")} label="Air buoyancy correction, entered directly (Mt)" name={p("AirBuoyancyOverrideMt")} />
        </div>
      </details>
    </div>
  );
}

export function OutturnForm({
  jobId,
  tanks,
  defaults,
}: {
  jobId: number;
  tanks: Tank[];
  defaults: OutturnDefaults;
}) {
  const [state, action, pending] = useActionState(saveOutturnData, initial);
  const [isCrudeOil, setIsCrudeOil] = useState(defaults.isCrudeOil);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ot-movement-${jobId}`}>Movement type</Label>
          <select
            id={`ot-movement-${jobId}`}
            name="movementType"
            required
            defaultValue={defaults.movementType ?? ""}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="">Select…</option>
            <option value="receipt">Receipt into tank</option>
            <option value="delivery">Delivery / issue from tank</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`ot-density-unit-${jobId}`}>Density unit</Label>
          <select
            id={`ot-density-unit-${jobId}`}
            name="densityUnit"
            defaultValue={defaults.densityUnit}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
          >
            <option value="kg_m3">kg/m³</option>
            <option value="g_cm3">g/cm³</option>
          </select>
        </div>
        <div className="flex items-end gap-2 pb-1.5">
          <input
            id={`ot-crude-${jobId}`}
            name="isCrudeOil"
            type="checkbox"
            defaultChecked={defaults.isCrudeOil}
            onChange={(e) => setIsCrudeOil(e.target.checked)}
            className="size-4 accent-[#c98e12]"
          />
          <Label htmlFor={`ot-crude-${jobId}`} className="font-normal">
            Crude oil (applies S&amp;W)
          </Label>
        </div>
      </div>

      <ReadingSection
        jobId={jobId}
        side="initial"
        title="Initial reading"
        tanks={tanks}
        defaultTankId={defaults.initialTankId}
        isCrudeOil={isCrudeOil}
        defaults={defaults}
      />
      <ReadingSection
        jobId={jobId}
        side="final"
        title="Final reading"
        tanks={tanks}
        defaultTankId={defaults.finalTankId}
        isCrudeOil={isCrudeOil}
        defaults={defaults}
      />

      <Button type="submit" disabled={pending} variant="outline" className="self-start">
        {pending ? "Calculating…" : "Save Outturn"}
      </Button>
      {!state.ok && state.message && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      {state.ok && state.message && (
        <Alert className="border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
          <AlertDescription className="text-[#1f7a4d]">{state.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
