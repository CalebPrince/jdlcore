import "server-only";
import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { requireDb } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditTargetType = "staff" | "inspector" | "client" | "service" | "tank" | "settings";

/**
 * Records an account-management or settings change. Job status changes have
 * their own dedicated trail (jobUpdates) and should not be logged here.
 * Best-effort: a logging failure never breaks the action that triggered it.
 */
export async function logAudit(input: {
  actor: { id: number; name: string; role: string };
  action: string;
  targetType: AuditTargetType;
  targetId?: number | null;
  summary: string;
}): Promise<void> {
  try {
    await requireDb().insert(auditLog).values({
      actorId: input.actor.id,
      actorName: `${input.actor.name} (${input.actor.role})`,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      summary: input.summary,
    });
  } catch (err) {
    console.error("logAudit:", err);
  }
}

export type AuditFilters = {
  targetType?: AuditTargetType;
  from?: string;
  to?: string;
};

export async function loadAuditLog(filters: AuditFilters) {
  const database = requireDb();
  const conditions: SQL[] = [];
  if (filters.targetType) conditions.push(eq(auditLog.targetType, filters.targetType));
  if (filters.from) conditions.push(gte(auditLog.createdAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(auditLog.createdAt, new Date(`${filters.to}T23:59:59.999Z`)));

  return database
    .select()
    .from(auditLog)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(200);
}
