import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { z } from "zod";
import { DEFAULT_KNOWLEDGE, knowledgeSchema, renderPlatformKnowledge } from "./platform-knowledge";

export const KNOWLEDGE_KEY = "ai_platform_knowledge_v1";
export const registrySchema = z.object({
  revision: z.number().int().nonnegative(),
  draft: knowledgeSchema,
  published: knowledgeSchema,
  publishedVersion: z.number().int().nonnegative(),
  updatedBy: z.string(),
  publishedAt: z.string().nullable(),
});
export type KnowledgeRegistry = z.infer<typeof registrySchema>;
export function initialRegistry(): KnowledgeRegistry {
  return { revision: 0, draft: DEFAULT_KNOWLEDGE, published: DEFAULT_KNOWLEDGE, publishedVersion: 0, updatedBy: "Code baseline", publishedAt: null };
}

export async function loadKnowledgeRegistry(): Promise<KnowledgeRegistry> {
  if (!db) return initialRegistry();
  const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, KNOWLEDGE_KEY)).limit(1);
  return rows[0] ? registrySchema.parse(JSON.parse(rows[0].value)) : initialRegistry();
}

export async function buildPlatformContext(): Promise<string> {
  try {
    return renderPlatformKnowledge((await loadKnowledgeRegistry()).published);
  } catch {
    // Do not resurrect obsolete published knowledge when storage is unavailable.
    return "Platform knowledge is temporarily unavailable. Do not rely on persona text for division capabilities or launch status. Say you cannot verify platform details and direct the user to the relevant division page or contact team.";
  }
}
