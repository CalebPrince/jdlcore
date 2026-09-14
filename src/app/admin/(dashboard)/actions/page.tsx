import { notFound } from "next/navigation";
import { getStaff } from "@/lib/staff-auth";
import { listPendingProposals, listRecentDecidedProposals } from "@/lib/reviewed-actions";
import {
  ReviewedActionsPanel,
  type DecidedProposalView,
  type PendingProposalView,
} from "@/components/admin/reviewed-actions-panel";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function targetLink(targetType: string, targetId: number): string {
  if (targetType === "job") return `/admin/jobs/${targetId}`;
  return "/admin";
}

export default async function AdminActionsPage() {
  const staff = await getStaff();
  if (!staff) notFound();

  let pending: PendingProposalView[] = [];
  let decided: DecidedProposalView[] = [];
  try {
    const [pendingRows, decidedRows] = await Promise.all([listPendingProposals(), listRecentDecidedProposals()]);
    pending = pendingRows.map((row) => ({
      id: row.id,
      summary: row.summary,
      targetLink: targetLink(row.targetType, row.targetId),
      proposedByName: row.proposedByName,
      createdAtLabel: dateFmt.format(row.createdAt),
    }));
    decided = decidedRows.map((row) => {
      const result = row.executionResult as { message?: string } | null;
      return {
        id: row.id,
        summary: row.summary,
        targetLink: targetLink(row.targetType, row.targetId),
        proposedByName: row.proposedByName,
        createdAtLabel: dateFmt.format(row.createdAt),
        status: row.status,
        reviewedByName: row.reviewedByName,
        reviewNote: row.reviewNote,
        executionMessage: result?.message ?? null,
      };
    });
  } catch (err) {
    console.error("admin actions page:", err);
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Reviewed Actions</h1>
        <p className="text-sm text-muted-foreground">
          Actions the Admin Operations Assistant has proposed while running in agent mode — nothing here has
          happened yet. Approving runs the same business logic as the equivalent action on the Jobs screen;
          rejecting requires a note.
        </p>
      </div>
      <ReviewedActionsPanel pending={pending} decided={decided} />
    </div>
  );
}
