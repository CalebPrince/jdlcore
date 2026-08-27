"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { services } from "@/db/schema";
import { requireStaffRole } from "@/lib/staff-auth";
import { logAudit } from "@/lib/audit";
import type { FormState } from "./submissions";

const ADMIN_ROLES = ["administrator", "superadmin"] as const;

const updateSchema = z.object({
  id: z.coerce.number().int().positive(),
  pricingLabel: z.string().trim().max(120).optional(),
  defaultPriceCents: z.string().optional(),
  active: z.enum(["true", "false"]),
});

export async function updateService(_prev: FormState, formData: FormData): Promise<FormState> {
  const current = await requireStaffRole([...ADMIN_ROLES]);
  if (!current) return { ok: false, message: "Unauthorized" };
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Check the fields and try again." };
  const f = parsed.data;

  const priceCents =
    f.defaultPriceCents && f.defaultPriceCents.trim() !== ""
      ? Math.round(Number(f.defaultPriceCents) * 100)
      : null;
  if (f.defaultPriceCents && f.defaultPriceCents.trim() !== "" && (Number.isNaN(priceCents) || priceCents! < 0)) {
    return { ok: false, message: "Enter a valid price." };
  }

  await requireDb()
    .update(services)
    .set({
      pricingLabel: f.pricingLabel || null,
      defaultPriceCents: priceCents,
      active: f.active === "true",
    })
    .where(eq(services.id, f.id));

  revalidatePath("/admin/services");
  revalidatePath("/portal/request");
  await logAudit({
    actor: current,
    action: "service.updated",
    targetType: "service",
    targetId: f.id,
    summary: `Updated service #${f.id} (${f.active === "true" ? "active" : "inactive"}${f.pricingLabel ? `, ${f.pricingLabel}` : ""}).`,
  });
  return { ok: true, message: "Service updated." };
}
