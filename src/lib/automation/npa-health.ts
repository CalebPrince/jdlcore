import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { requireDb } from "@/db";
import { knowledgeDocuments } from "@/db/schema";
import { brandedEmailHtml } from "@/lib/email";
import { notifyStaffBoth } from "@/lib/notifications";
import type { NpaSyncResult } from "@/lib/analytics-npa-sync";
import { claimEvent } from "./events";

/** NPA publishes price indicators most working days; a week of silence means something broke. */
const STALE_AFTER_DAYS = 7;

const isoDay = () => new Date().toISOString().slice(0, 10);

/** ISO-ish year-week so a persistent condition alerts weekly instead of every day. */
function weekKey(): string {
  const d = new Date();
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.floor(((d.getTime() - start.getTime()) / 86_400_000 + start.getUTCDay()) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

async function alertStaff(type: string, title: string, lines: string[]): Promise<void> {
  await notifyStaffBoth({
    roles: ["administrator", "superadmin"],
    type,
    title,
    body: lines[0],
    link: "/admin/analytics",
    emailSubject: title,
    emailHtml: brandedEmailHtml({
      label: "JDL CORE ADMIN",
      heading: title,
      bodyLines: lines,
      ctaUrl: "https://jdlcore.com/admin/analytics",
      ctaLabel: "Open Analytics admin",
    }),
  });
}

/**
 * Turns a silent daily NPA crawl into something staff hear about. Alerts (each at most once
 * per day or week) when: documents failed to ingest, a source folder couldn't be listed,
 * the crawl found nothing at all, or no NPA document has been ingested for a week.
 */
export async function alertOnNpaSyncHealth(result: NpaSyncResult) {
  const alerts: string[] = [];

  if (result.failed > 0 && (await claimEvent("npa_sync_failed", isoDay()))) {
    await alertStaff("npa_sync_failed", `NPA sync: ${result.failed} document${result.failed === 1 ? "" : "s"} failed to ingest`, [
      `Today's crawl added ${result.added} and failed on ${result.failed}. Failed files are retried on the next run.`,
      "Check the failure reasons in the knowledge documents list if this keeps happening.",
    ]);
    alerts.push("failed");
  }

  if ((result.sourceErrors > 0 || result.scanned === 0) && (await claimEvent("npa_sync_no_listing", isoDay()))) {
    await alertStaff("npa_sync_no_listing", "NPA sync could not list files", [
      result.scanned === 0
        ? "The crawl found no files at all. npa.gov.gh may be down, blocking the server, or its file listing may have changed."
        : `${result.sourceErrors} NPA source folder(s) could not be listed today (${result.scanned} files found from the rest).`,
    ]);
    alerts.push("no_listing");
  }

  const latest = await requireDb()
    .select({ latest: sql<Date | null>`max(${knowledgeDocuments.processedAt})` })
    .from(knowledgeDocuments)
    .where(and(like(knowledgeDocuments.url, "https://npa.gov.gh/%"), eq(knowledgeDocuments.status, "ready")));
  const last = latest[0]?.latest ? new Date(latest[0].latest) : null;
  const staleDays = last ? Math.floor((Date.now() - last.getTime()) / 86_400_000) : null;
  if (staleDays !== null && staleDays >= STALE_AFTER_DAYS && (await claimEvent("npa_sync_stale", weekKey()))) {
    await alertStaff("npa_sync_stale", `No new NPA documents in ${staleDays} days`, [
      `The last NPA document was ingested ${staleDays} days ago. Analytics answers may be going out of date.`,
    ]);
    alerts.push("stale");
  }

  return { alerts };
}
