// Pure decision rules for auto-assignment: no database, no server-only imports, so they can be tested directly.

export type Candidate = {
  id: number;
  name: string;
  regions: string[];
  serviceTypes: string[];
  maxOpenJobs: number;
  unavailableUntil: Date | null;
};

export type JobFacts = {
  serviceType: string | null;
  location: string | null;
  tankOrDepot: string | null;
  requestedDate: Date | null;
};

export type PickResult =
  | { found: true; inspectorId: number; inspectorName: string; reason: string }
  | { found: false; why: string };

/**
 * Chooses who a job should go to from inspectors already switched on for auto-assignment. Each must
 * pass every rule: qualified for the service, location matches a region (no regions = any location),
 * not away on the requested date (or now), under their open-job limit, and not already tried on this
 * job. Among those: best local match, then lightest load relative to their limit, then most previous
 * work for this client, then name. The reason is returned for the job timeline.
 */
export function chooseInspector(
  job: JobFacts,
  candidates: Candidate[],
  openBy: Map<number | null, number>,
  clientBy: Map<number | null, number>,
  excludeInspectorIds: number[] = [],
  now: Date = new Date(),
): PickResult {
  if (!job.serviceType) return { found: false, why: "the job has no service type set" };
  if (candidates.length === 0) return { found: false, why: "no inspector is switched on for auto-assignment" };

  const place = `${job.location ?? ""} ${job.tankOrDepot ?? ""}`.toLowerCase().trim();
  const needsDate = job.requestedDate ?? now;
  const skipped = { service: 0, region: 0, away: 0, full: 0, tried: 0 };
  const eligible: { id: number; name: string; regionMatch: string | null; open: number; max: number; clientJobs: number }[] = [];

  for (const c of candidates) {
    if (excludeInspectorIds.includes(c.id)) {
      skipped.tried += 1;
      continue;
    }
    if (!c.serviceTypes.includes(job.serviceType)) {
      skipped.service += 1;
      continue;
    }
    if (c.unavailableUntil && c.unavailableUntil > needsDate) {
      skipped.away += 1;
      continue;
    }
    const openNow = openBy.get(c.id) ?? 0;
    if (openNow >= c.maxOpenJobs) {
      skipped.full += 1;
      continue;
    }
    let regionMatch: string | null = null;
    if (place && c.regions.length > 0) {
      regionMatch = c.regions.find((r) => r.trim() && place.includes(r.trim().toLowerCase())) ?? null;
      if (!regionMatch) {
        skipped.region += 1;
        continue;
      }
    }
    eligible.push({ id: c.id, name: c.name, regionMatch, open: openNow, max: c.maxOpenJobs, clientJobs: clientBy.get(c.id) ?? 0 });
  }

  if (eligible.length === 0) {
    const parts = [
      skipped.service && `${skipped.service} not qualified for this service`,
      skipped.region && `${skipped.region} outside this location`,
      skipped.away && `${skipped.away} away`,
      skipped.full && `${skipped.full} at their job limit`,
      skipped.tried && `${skipped.tried} already tried`,
    ].filter(Boolean);
    return { found: false, why: parts.length ? parts.join(", ") : "no eligible inspector" };
  }

  eligible.sort(
    (a, b) =>
      Number(a.regionMatch === null) - Number(b.regionMatch === null) ||
      a.open / a.max - b.open / b.max ||
      b.clientJobs - a.clientJobs ||
      a.name.localeCompare(b.name),
  );
  const best = eligible[0];
  const reasons = [
    best.regionMatch ? `covers ${best.regionMatch}` : "covers any location",
    "qualified for this service",
    `${best.open} of ${best.max} open jobs`,
    best.clientJobs > 0 ? `${best.clientJobs} previous job${best.clientJobs === 1 ? "" : "s"} for this client` : null,
  ].filter(Boolean);
  return { found: true, inspectorId: best.id, inspectorName: best.name, reason: reasons.join(", ") };
}
