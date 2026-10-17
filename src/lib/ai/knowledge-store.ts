import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { z } from "zod";
import { DEFAULT_KNOWLEDGE, knowledgeSchema, renderPlatformKnowledge, type PlatformKnowledge } from "./platform-knowledge";

export const KNOWLEDGE_KEY = "ai_platform_knowledge_v1";
// Bounds how many past published snapshots are retained for rollback.
export const MAX_HISTORY_ENTRIES = 20;

export const historyEntrySchema = z.object({
  version: z.number().int().nonnegative(),
  publishedAt: z.string().nullable(),
  publishedBy: z.string(),
  knowledge: knowledgeSchema,
});
export type KnowledgeHistoryEntry = z.infer<typeof historyEntrySchema>;

export const registrySchema = z.object({
  revision: z.number().int().nonnegative(),
  draft: knowledgeSchema,
  published: knowledgeSchema,
  publishedVersion: z.number().int().nonnegative(),
  updatedBy: z.string(),
  publishedAt: z.string().nullable(),
  // Who actually ran the publish action for the current `published` snapshot,
  // as distinct from `updatedBy` (whoever last saved a draft or publish).
  publishedBy: z.string().nullable().default(null),
  // Most recent first, capped at MAX_HISTORY_ENTRIES.
  history: z.array(historyEntrySchema).default([]),
});
export type KnowledgeRegistry = z.infer<typeof registrySchema>;
export function initialRegistry(): KnowledgeRegistry {
  return { revision: 0, draft: DEFAULT_KNOWLEDGE, published: DEFAULT_KNOWLEDGE, publishedVersion: 0, updatedBy: "Code baseline", publishedAt: null, publishedBy: null, history: [] };
}

export async function loadKnowledgeRegistry(): Promise<KnowledgeRegistry> {
  if (!db) return initialRegistry();
  const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KNOWLEDGE_KEY)).limit(1);
  return rows[0] ? registrySchema.parse(JSON.parse(rows[0].value)) : initialRegistry();
}

/**
 * Analytics was withdrawn from JDL Core and is kept for the platform owner only. Every assistant
 * except the owner-only Analytics one gets the knowledge without it, so none of them offer it.
 * The stored registry is left as is.
 */
function withoutAnalytics(knowledge: PlatformKnowledge): PlatformKnowledge {
  return {
    ...knowledge,
    company: knowledge.company.replace(/, industry analytics,/i, "").replace(/analytics subscribers, /i, ""),
    divisions: knowledge.divisions.filter((d) => d.id !== "analytics"),
  };
}

/** The registry as a non-owner superadmin sees it in AI Settings: no Analytics division anywhere. */
export function registryWithoutAnalytics(registry: KnowledgeRegistry): KnowledgeRegistry {
  return {
    ...registry,
    draft: withoutAnalytics(registry.draft),
    published: withoutAnalytics(registry.published),
    history: registry.history.map((h) => ({ ...h, knowledge: withoutAnalytics(h.knowledge) })),
  };
}

/** A non-owner's save never sees the Analytics division, so carry the stored one over unchanged. */
export function keepAnalyticsDivision(next: PlatformKnowledge, previous: PlatformKnowledge): PlatformKnowledge {
  const kept = previous.divisions.find((d) => d.id === "analytics");
  const divisions = next.divisions.filter((d) => d.id !== "analytics");
  // An untouched company line keeps its stored wording; an edited one is the editor's.
  const company = next.company === withoutAnalytics(previous).company ? previous.company : next.company;
  return { ...next, company, divisions: kept ? [...divisions, kept] : divisions };
}

export async function buildPlatformContext(question?: string, opts: { includeAnalytics?: boolean } = {}): Promise<string> {
  try {
    const published = (await loadKnowledgeRegistry()).published;
    if (opts.includeAnalytics) return renderPlatformKnowledge(published, { question });
    return [
      renderPlatformKnowledge(withoutAnalytics(published), { question }),
      "JDL Core has two divisions: Inspection Services and the Academy. It does not offer an analytics product or subscription; if asked, say so and point to those two divisions.",
    ].join("\n");
  } catch {
    // Do not resurrect obsolete published knowledge when storage is unavailable.
    return "Platform knowledge is temporarily unavailable. Do not rely on persona text for division capabilities or launch status. Say you cannot verify platform details and direct the user to the relevant division page or contact team.";
  }
}
