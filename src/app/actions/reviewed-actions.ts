"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getStaff } from "@/lib/staff-auth";
import { approveProposal, rejectProposal } from "@/lib/reviewed-actions";
import type { FormState } from "./submissions";

const initialFail = (message: string): FormState => ({ ok: false, message });

const idSchema = z.object({ proposalId: z.coerce.number().int().positive() });

/**
 * Permission is rechecked inside approveProposal/rejectProposal against the
 * specific action type's own required roles — not just "any active staff" —
 * since different reviewed-action types may need different authority.
 */
export async function approveProposedAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await getStaff();
  if (!staff) return initialFail("Unauthorized");
  const parsed = idSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail("Invalid proposal.");

  const result = await approveProposal(parsed.data.proposalId, staff);
  revalidatePath("/admin/actions");
  return result;
}

const rejectSchema = idSchema.extend({ note: z.string().trim().min(3, "A rejection note is required.") });

export async function rejectProposedAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await getStaff();
  if (!staff) return initialFail("Unauthorized");
  const parsed = rejectSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return initialFail(parsed.error.issues[0]?.message ?? "Invalid input.");

  const result = await rejectProposal(parsed.data.proposalId, staff, parsed.data.note);
  revalidatePath("/admin/actions");
  return result;
}
