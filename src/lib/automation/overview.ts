import "server-only";
import { and, desc, eq, gt, like, or, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { automationEvents, automationRuns, jobUpdates, jobs } from "@/db/schema";
import { getAutomationSettings, getInvoiceSettings } from "@/lib/settings";
import {
  AUTOMATIONS,
  EVENT_LABELS,
  agoText,
  assessHealth,
  describeRun,
  type Automation,
  type Health,
} from "./catalog";

export type AutomationCard = Automation & {
  /** on/off for the ones with a choice; "always" for the rest. */
  state: "on" | "off" | "shadow" | "always";
  stateLabel: string;
  when: string;
  /** Scheduled only. */
  health?: Health;
  lastRunText?: string;
  lastResult?: string;
};

export type ActivityItem = { id: number; jobId: number; ref: string; text: string; when: string };

export type AutomationOverview = {
  scheduled: AutomationCard[];
  event: AutomationCard[];
  needsAttention: number;
  runningCount: number;
  historyAvailable: boolean;
  activity: ActivityItem[];
  counts: { label: string; count: number }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Everything the admin Automations page shows: what each automation is, whether it is switched on,
 * when it last ran and how it went, and what it has done by itself recently. Read-only.
 */
export async function loadAutomationOverview(): Promise<AutomationOverview> {
  const database = requireDb();
  const now = Date.now();
  const settings = await getAutomationSettings();
  const invoice = await getInvoiceSettings();

  // ---- run history (may not exist yet, e.g. right after a deploy)
  let runs: { task: string; ok: boolean; startedAt: Date; source: string; summary: unknown; error: string | null }[] = [];
  let historyAvailable = true;
  try {
    runs = await database
      .select({
        task: automationRuns.task,
        ok: automationRuns.ok,
        startedAt: automationRuns.startedAt,
        source: automationRuns.source,
        summary: automationRuns.summary,
        error: automationRuns.error,
      })
      .from(automationRuns)
      .where(gt(automationRuns.startedAt, new Date(now - 14 * DAY_MS)))
      .orderBy(desc(automationRuns.startedAt))
      .limit(1500);
  } catch {
    historyAvailable = false;
  }
  const lastByTask = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!lastByTask.has(r.task)) lastByTask.set(r.task, r);
  const hourlySeen = runs.some((r) => r.source === "hourly" && now - r.startedAt.getTime() < 2 * DAY_MS);

  // ---- cards
  const stateFor = (a: Automation): Pick<AutomationCard, "state" | "stateLabel"> => {
    if (a.switch === "autoAssign") return settings.autoAssign === "1" ? { state: "on", stateLabel: "On" } : { state: "off", stateLabel: "Off" };
    if (a.switch === "autoInvoice") return invoice.autoIssue === "1" ? { state: "on", stateLabel: "On" } : { state: "off", stateLabel: "Off" };
    if (a.switch === "approval") {
      return settings.approvalMode === "auto"
        ? { state: "on", stateLabel: "Automatic" }
        : settings.approvalMode === "shadow"
          ? { state: "shadow", stateLabel: "Watching only" }
          : { state: "off", stateLabel: "Off" };
    }
    return { state: "always", stateLabel: "Always on" };
  };

  const cards: AutomationCard[] = AUTOMATIONS.map((a) => {
    const base: AutomationCard = { ...a, ...stateFor(a), when: a.when };
    if (a.kind !== "scheduled" || !a.task || !a.cadence) return base;
    if (a.cadence === "hourly-or-daily") base.when = hourlySeen ? "Every hour" : "Once a day, in the morning";
    const last = lastByTask.get(a.task);
    // A switched-off automation isn't "late": it has nothing to do, and that's fine.
    const health: Health = base.state === "off" ? "healthy" : assessHealth(a.cadence, last, hourlySeen, now);
    return {
      ...base,
      health,
      lastRunText: last ? agoText(last.startedAt, now) : historyAvailable ? "Not run yet" : "Not recorded yet",
      lastResult: last ? (last.ok ? describeRun(a.task, last.summary) : "The last run didn't finish. It will try again on its next run.") : undefined,
    };
  });
  const scheduled = cards.filter((c) => c.kind === "scheduled");
  const event = cards.filter((c) => c.kind === "event");

  // ---- what the platform did by itself recently
  const since7 = new Date(now - 7 * DAY_MS);
  const autoRows = await database
    .select({ id: jobUpdates.id, jobId: jobUpdates.jobId, ref: jobs.ref, note: jobUpdates.note, createdAt: jobUpdates.createdAt })
    .from(jobUpdates)
    .innerJoin(jobs, eq(jobUpdates.jobId, jobs.id))
    .where(
      and(
        eq(jobUpdates.actorType, "system"),
        gt(jobUpdates.createdAt, since7),
        or(
          like(jobUpdates.note, "Auto-assigned%"),
          like(jobUpdates.note, "Auto-reassigned%"),
          like(jobUpdates.note, "Auto-approved%"),
          like(jobUpdates.note, "Closed automatically%"),
          like(jobUpdates.note, "Auto-assignment found no eligible%"),
          like(jobUpdates.note, "Invoice % issued automatically%"),
        ),
      ),
    )
    .orderBy(desc(jobUpdates.createdAt))
    .limit(200);

  const kindOf = (note: string | null): string => {
    const t = note ?? "";
    if (t.startsWith("Auto-reassigned")) return "Jobs moved to another inspector";
    if (t.startsWith("Auto-assigned")) return "Jobs assigned to an inspector";
    if (t.startsWith("Auto-approved")) return "Jobs approved automatically";
    if (t.startsWith("Closed automatically")) return "Jobs closed automatically";
    if (t.startsWith("Auto-assignment found no")) return "Jobs that needed a person to assign";
    return "Invoices issued automatically";
  };
  const activity: ActivityItem[] = autoRows.slice(0, 12).map((r) => ({
    id: r.id,
    jobId: r.jobId,
    ref: r.ref,
    // Reads well on its own: the note already says who/why (e.g. "Auto-assigned to Kojo because they cover Tema...").
    text: (r.note ?? "").replace(/^Auto-reassigned from/, "Moved on from").replace(/^Auto-assigned to/, "Assigned to").replace(/^Auto-approved:/, "Approved automatically:"),
    when: agoText(r.createdAt, now),
  }));

  const tally = new Map<string, number>();
  for (const r of autoRows) tally.set(kindOf(r.note), (tally.get(kindOf(r.note)) ?? 0) + 1);

  // ---- reminders and alerts the platform remembers sending (one row per thing sent)
  try {
    const events = await database
      .select({ kind: automationEvents.kind, n: sql<number>`count(*)::int` })
      .from(automationEvents)
      .where(gt(automationEvents.createdAt, since7))
      .groupBy(automationEvents.kind);
    for (const e of events) {
      const label = EVENT_LABELS[e.kind];
      if (label) tally.set(label, (tally.get(label) ?? 0) + e.n);
    }
  } catch {
    /* the reminders count is a nice-to-have */
  }
  const counts = [...tally.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  const needsAttention = scheduled.filter((c) => c.health === "failed" || c.health === "late").length;
  const runningCount = scheduled.filter((c) => c.health === "healthy" && c.state !== "off").length + event.filter((c) => c.state !== "off").length;

  return { scheduled, event, needsAttention, runningCount, historyAvailable, activity, counts };
}
