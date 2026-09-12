"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/db";
import { settings } from "@/db/schema";
import { requireStaffRole } from "@/lib/staff-auth";
import { logAudit } from "@/lib/audit";
import { knowledgeSchema } from "@/lib/ai/platform-knowledge";
import { initialRegistry, KNOWLEDGE_KEY, registrySchema } from "@/lib/ai/knowledge-store";

export async function savePlatformKnowledge(_previous: { ok: boolean; message: string; revision: number }, data: FormData) {
  const revision = Number(data.get("revision"));
  const fail = (message: string) => ({ ok: false, message, revision });
  const current = await requireStaffRole(["superadmin"]);
  if (!current) return fail("Unauthorized.");
  const intent = data.get("intent");
  if (!["draft", "publish"].includes(String(intent)) || !Number.isInteger(revision) || revision < 0) return fail("Invalid request.");
  const raw = data.get("knowledge");
  if (typeof raw !== "string" || raw.length > 450000) return fail("Knowledge is missing or too large.");
  try {
    const parsed = knowledgeSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return fail("Complete every required field and use unique division identifiers (lowercase letters, numbers and hyphens).");
    const database = requireDb();
    const rows = await database.select().from(settings).where(eq(settings.key, KNOWLEDGE_KEY)).limit(1);
    const previous = rows[0] ? registrySchema.parse(JSON.parse(rows[0].value)) : initialRegistry();
    if (previous.revision !== revision) return fail("Another administrator updated this knowledge. Reload the page before saving.");
    const next = { ...previous, draft: parsed.data, revision: revision + 1, updatedBy: current.name,
      ...(intent === "publish" ? { published: parsed.data, publishedVersion: previous.publishedVersion + 1, publishedAt: new Date().toISOString() } : {}) };
    const value = JSON.stringify(next);
    const saved = rows[0]
      ? await database.update(settings).set({ value, updatedAt: new Date() }).where(and(eq(settings.key, KNOWLEDGE_KEY), eq(settings.value, rows[0].value))).returning({ key: settings.key })
      : await database.insert(settings).values({ key: KNOWLEDGE_KEY, value }).onConflictDoNothing().returning({ key: settings.key });
    if (!saved.length) return fail("Another administrator updated this knowledge. Reload the page before saving.");
    await logAudit({ actor: current, action: `settings.knowledge_${intent}`, targetType: "settings", summary: `Platform knowledge ${intent === "publish" ? `published as version ${next.publishedVersion}` : "draft saved"}; revision ${next.revision}.` });
    revalidatePath("/admin/ai");
    return { ok: true, message: intent === "publish" ? `Version ${next.publishedVersion} published. Assistants will use it on their next request.` : "Draft saved. Assistant knowledge has not changed.", revision: next.revision };
  } catch {
    return fail("Could not save knowledge. Check the fields and database connection.");
  }
}
