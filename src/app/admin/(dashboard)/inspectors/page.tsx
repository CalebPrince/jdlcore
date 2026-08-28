import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { requireDb } from "@/db";
import { inspectors } from "@/db/schema";
import { getStaff } from "@/lib/staff-auth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleInspectorActive, updateInspectorEmail } from "@/app/actions/inspector-authadmin";
import { InviteInspectorForm } from "@/components/admin/inspector-forms";
import { EditEmailInline } from "@/components/admin/edit-email-inline";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const STATUS_META: Record<string, { label: string; variant: "secondary" | "outline" }> = {
  active: { label: "Active", variant: "secondary" },
  invited: { label: "Invited", variant: "outline" },
  disabled: { label: "Disabled", variant: "outline" },
};

export default async function AdminInspectorsPage() {
  const current = await getStaff();
  if (!current || (current.role !== "administrator" && current.role !== "superadmin")) notFound();

  let list: Awaited<ReturnType<typeof loadInspectors>> = [];
  let dbError = false;
  try {
    list = await loadInspectors();
  } catch {
    dbError = true;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Inspectors</h1>
        <p className="text-sm text-muted-foreground">
          Field inspector accounts. Inactive inspectors can&apos;t be assigned new jobs.
        </p>
      </div>

      <InviteInspectorForm />

      {dbError ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Database not reachable.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Inspector Accounts ({list.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {list.length === 0 && (
              <p className="m-0 text-sm text-muted-foreground">No inspectors yet.</p>
            )}
            {list.map((i) => {
              const statusMeta = STATUS_META[i.status] ?? STATUS_META.invited;
              return (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border p-4"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="min-w-[180px] flex-1">
                    <p className="m-0 text-sm font-semibold text-navy-950">{i.name}</p>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <EditEmailInline id={i.id} email={i.email} action={updateInspectorEmail} />
                      {i.phone ? ` · ${i.phone}` : ""}
                    </div>
                  </div>
                  <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                  <Badge variant={i.active ? "secondary" : "outline"}>
                    {i.active ? "Available" : "Unavailable"}
                  </Badge>
                  <span className="text-xs text-ink-faint">
                    Added {dateFmt.format(new Date(i.createdAt))}
                  </span>
                  <form action={toggleInspectorActive}>
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="active" value={i.active ? "false" : "true"} />
                    <Button type="submit" variant="ghost" size="sm">
                      {i.active ? "Mark Unavailable" : "Mark Available"}
                    </Button>
                  </form>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function loadInspectors() {
  return requireDb().select().from(inspectors).orderBy(desc(inspectors.createdAt));
}
