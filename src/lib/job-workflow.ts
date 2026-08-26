import type { JobStatus } from "@/lib/jobs";
import type { StaffRole } from "@/lib/staff-auth";

export type ActorType = "client" | "inspector" | "staff" | "system";

export type Actor = {
  type: ActorType;
  id: number;
  name: string;
  role?: StaffRole; // only meaningful when type === "staff"
};

type TransitionRole = "client" | "inspector" | StaffRole | "system";

function actorRoles(actor: Actor): TransitionRole[] {
  if (actor.type === "client") return ["client"];
  if (actor.type === "inspector") return ["inspector"];
  if (actor.type === "system") return ["system"];
  return [actor.role ?? "operations"];
}

const STAFF_ANY: TransitionRole[] = ["operations", "administrator", "superadmin"];
const STAFF_ADMIN: TransitionRole[] = ["administrator", "superadmin"];

const TRANSITIONS: Record<JobStatus, { to: JobStatus; roles: TransitionRole[] }[]> = {
  awaiting_assignment: [{ to: "assigned", roles: STAFF_ANY }],
  assigned: [
    { to: "assigned", roles: STAFF_ANY }, // reassign
    { to: "inspector_accepted", roles: ["inspector"] },
    { to: "awaiting_assignment", roles: ["inspector"] }, // decline
  ],
  inspector_accepted: [{ to: "in_progress", roles: ["inspector"] }],
  in_progress: [
    { to: "in_progress", roles: ["inspector"] }, // progress update, no status change
    { to: "awaiting_approval", roles: ["inspector"] },
  ],
  awaiting_approval: [
    { to: "approved", roles: STAFF_ANY },
    { to: "rejected_amendment", roles: STAFF_ANY },
  ],
  rejected_amendment: [{ to: "in_progress", roles: ["inspector"] }],
  approved: [{ to: "report_issued", roles: ["system"] }],
  report_issued: [{ to: "invoice_issued", roles: ["system"] }],
  invoice_issued: [{ to: "paid", roles: STAFF_ANY }],
  paid: [{ to: "closed", roles: STAFF_ANY }],
  closed: [],
};

export function canTransition(from: JobStatus, to: JobStatus, actor: Actor): boolean {
  const allowed = TRANSITIONS[from] ?? [];
  const roles = actorRoles(actor);
  return allowed.some((t) => t.to === to && t.roles.some((r) => roles.includes(r)));
}

/** Manual escape hatch — administrator/superadmin can force any status, with a mandatory note. */
export function canOverrideStatus(actor: Actor): boolean {
  return actor.type === "staff" && !!actor.role && STAFF_ADMIN.includes(actor.role);
}
