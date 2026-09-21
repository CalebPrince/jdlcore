import "server-only";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { services } from "@/db/schema";
import { SERVICE_TYPE_LABEL } from "@/lib/jobs";

export type ServiceOption = { key: string; label: string };

/**
 * The services a job can be for, as {key, label}: the active rows of the services table (which
 * admins can rename or switch off), or the built-in list if that table is empty or unreadable.
 * The key is what auto-assignment and auto-invoicing match on. Used by every place that offers a
 * choice of service: the public quote form, the client portal, and the admin screens.
 */
export async function listServiceOptions(): Promise<ServiceOption[]> {
  try {
    const rows = await requireDb()
      .select({ key: services.key, label: services.label })
      .from(services)
      .where(eq(services.active, true))
      .orderBy(services.position);
    if (rows.length > 0) return rows;
  } catch {
    /* fall through to the built-in list */
  }
  return (Object.entries(SERVICE_TYPE_LABEL) as [string, string][]).map(([key, label]) => ({ key, label }));
}
