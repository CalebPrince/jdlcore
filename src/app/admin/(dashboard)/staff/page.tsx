import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { requireDb } from "@/db";
import { staff } from "@/db/schema";
import { getStaff } from "@/lib/staff-auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleStaffActive } from "@/app/actions/staff-admin";
import { InviteStaffForm } from "@/components/admin/staff-forms";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  administrator: "Administrator",
  operations: "Operations",
};

const STATUS_META: Record<string, { label: string; variant: "secondary" | "outline" }> = {
  active: { label: "Active", variant: "secondary" },
  invited: { label: "Invited", variant: "outline" },
  disabled: { label: "Disabled", variant: "outline" },
};

export default async function AdminStaffPage() {
  const current = await getStaff();
  if (!current || (current.role !== "administrator" && current.role !== "superadmin")) notFound();

  let list: Awaited<ReturnType<typeof loadStaff>> = [];
  let dbError = false;
  try {
    list = await loadStaff();
  } catch {
    dbError = true;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Staff</h1>
        <p className="text-sm text-muted-foreground">
          Administrator and Operations accounts for the internal Command Center.
        </p>
      </div>

      <InviteStaffForm />

      {dbError ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Database not reachable.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Staff Accounts ({list.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {list.length === 0 && (
              <p className="m-0 text-sm text-muted-foreground">No staff accounts yet.</p>
            )}
            {list.map((s) => {
              const statusMeta = STATUS_META[s.status] ?? STATUS_META.invited;
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border p-4"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="min-w-[180px] flex-1">
                    <p className="m-0 text-sm font-semibold text-navy-950">{s.name}</p>
                    <p className="m-0 mt-0.5 text-xs text-muted-foreground">{s.email}</p>
                  </div>
                  <Badge variant="outline">{ROLE_LABEL[s.role] ?? s.role}</Badge>
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  <span className="text-xs text-ink-faint">
                    Added {dateFmt.format(new Date(s.createdAt))}
                  </span>
                  {s.id !== current.id && (
                    <form action={toggleStaffActive}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={s.status === "active" ? "false" : "true"} />
                      <Button type="submit" variant="ghost" size="sm">
                        {s.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    </form>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function loadStaff() {
  return requireDb().select().from(staff).orderBy(desc(staff.createdAt));
}
