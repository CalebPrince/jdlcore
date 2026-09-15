import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStaff } from "@/lib/staff-auth";
import { listResettableAccounts } from "@/lib/account-directory";
import { AccountResetPanel } from "@/components/admin/account-reset-panel";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset Accounts | JDL Core Admin" };

export default async function AdminAccountResetPage() {
  const current = await getStaff();
  if (!current || current.role !== "superadmin") notFound();

  let accounts: Awaited<ReturnType<typeof listResettableAccounts>> = [];
  let dbError = false;
  try {
    accounts = await listResettableAccounts();
  } catch {
    dbError = true;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Reset Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Select any client, staff, inspector, academy, or analytics account and either email
          them a reset link or set a brand-new password to hand-deliver yourself. Super admin
          only.
        </p>
      </div>

      {dbError ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Database not reachable.
          </CardContent>
        </Card>
      ) : (
        <AccountResetPanel accounts={accounts} currentStaffId={current.id} />
      )}
    </div>
  );
}
