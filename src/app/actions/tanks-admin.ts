"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { tanks } from "@/db/schema";
import { requireStaffRole } from "@/lib/staff-auth";
import { logAudit } from "@/lib/audit";
import type { FormState } from "./submissions";

const ADMIN_ROLES = ["administrator", "superadmin"] as const;

const createSchema = z.object({
  clientId: z.coerce.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  product: z.string().trim().max(120).optional(),
  depot: z.string().trim().max(120).optional(),
  capacity: z.string().optional(),
  capacityUnit: z.string().trim().max(20).optional(),
});

export async function createTank(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the fields and try again." };
  const f = parsed.data;

  const inserted = await requireDb()
    .insert(tanks)
    .values({
      clientId: f.clientId,
      name: f.name,
      product: f.product || null,
      depot: f.depot || null,
      capacity: f.capacity && f.capacity.trim() !== "" ? f.capacity : null,
      capacityUnit: f.capacityUnit || "MT",
    })
    .returning({ id: tanks.id });

  revalidatePath("/admin/tanks");
  await logAudit({
    actor: current,
    action: "tank.created",
    targetType: "tank",
    targetId: inserted[0]?.id ?? null,
    summary: `Registered tank "${f.name}" for client #${f.clientId}.`,
  });
  return { ok: true, message: "Tank added." };
}

export async function toggleTankActive(formData: FormData): Promise<void> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return;
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "true";
  if (!id) return;
  await requireDb().update(tanks).set({ active }).where(eq(tanks.id, id));
  revalidatePath("/admin/tanks");
  await logAudit({
    actor: current,
    action: active ? "tank.enabled" : "tank.disabled",
    targetType: "tank",
    targetId: id,
    summary: `Marked tank #${id} as ${active ? "active" : "inactive"}.`,
  });
}
