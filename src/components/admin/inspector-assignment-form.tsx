"use client";

import { useActionState } from "react";
import { saveInspectorAssignmentProfile } from "@/app/actions/inspector-authadmin";
import type { FormState } from "@/app/actions/submissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SERVICE_TYPES, SERVICE_TYPE_LABEL } from "@/lib/jobs";

const initial: FormState = { ok: false, message: "" };

export type AssignmentProfileView = {
  regions: string[];
  serviceTypes: string[];
  maxOpenJobs: number;
  /** YYYY-MM-DD or "" */
  unavailableUntil: string;
  autoAssignEnabled: boolean;
};

export const EMPTY_PROFILE: AssignmentProfileView = {
  regions: [],
  serviceTypes: [],
  maxOpenJobs: 3,
  unavailableUntil: "",
  autoAssignEnabled: false,
};

export function InspectorAssignmentForm({ inspectorId, profile }: { inspectorId: number; profile: AssignmentProfileView }) {
  const [state, action, pending] = useActionState(saveInspectorAssignmentProfile, initial);
  const idp = `insp-${inspectorId}`;

  return (
    <form action={action} className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <input type="hidden" name="inspectorId" value={inspectorId} />

      <div className="flex items-start gap-3 sm:col-span-2">
        <input
          id={`${idp}-enabled`}
          name="autoAssignEnabled"
          type="checkbox"
          defaultChecked={profile.autoAssignEnabled}
          className="mt-1 size-4 accent-[#c98e12]"
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idp}-enabled`}>Include in automatic assignment</Label>
          <p className="text-xs text-muted-foreground">
            Off by default. Nothing is auto-assigned to this inspector until this is on and the profile below is filled in.
          </p>
        </div>
      </div>

      <fieldset className="flex flex-col gap-2 sm:col-span-2">
        <legend className="mb-1 text-sm font-medium">Services they are qualified for</legend>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {SERVICE_TYPES.map((key) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="serviceTypes"
                value={key}
                defaultChecked={profile.serviceTypes.includes(key)}
                className="size-4 accent-[#c98e12]"
              />
              {SERVICE_TYPE_LABEL[key]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={`${idp}-regions`}>Regions or places they cover</Label>
        <Input
          id={`${idp}-regions`}
          name="regions"
          defaultValue={profile.regions.join(", ")}
          placeholder="Tema, Takoradi, Accra"
        />
        <p className="text-xs text-muted-foreground">
          Comma separated. A job goes to them when its location or depot contains one of these words. Leave empty to cover any location.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idp}-max`}>Most open jobs at once</Label>
        <Input id={`${idp}-max`} name="maxOpenJobs" type="number" min={1} max={20} defaultValue={profile.maxOpenJobs} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idp}-away`}>Away until (optional)</Label>
        <Input id={`${idp}-away`} name="unavailableUntil" type="date" defaultValue={profile.unavailableUntil} />
        <p className="text-xs text-muted-foreground">No jobs are auto-assigned before this date.</p>
      </div>

      <div className="sm:col-span-2">
        {state.message && (
          <p className={`mb-2 text-sm font-medium ${state.ok ? "text-[#1f7a4d]" : "text-destructive"}`} role="status">
            {state.message}
          </p>
        )}
        <Button type="submit" size="sm" disabled={pending} className="btn-gold">
          {pending ? "Saving…" : "Save assignment profile"}
        </Button>
      </div>
    </form>
  );
}
