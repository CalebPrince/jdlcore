import { notFound } from "next/navigation";
import { getStaff } from "@/lib/staff-auth";
import { loadAuditLog, type AuditTargetType } from "@/lib/audit";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const TARGET_TYPES: { value: AuditTargetType; label: string }[] = [
  { value: "staff", label: "Staff" },
  { value: "inspector", label: "Inspectors" },
  { value: "client", label: "Clients" },
  { value: "service", label: "Services" },
  { value: "tank", label: "Tanks" },
  { value: "settings", label: "Settings" },
];

const TARGET_BADGE: Record<string, string> = {
  staff: "bg-navy-100 text-navy-800",
  inspector: "bg-[rgba(31,122,77,0.1)] text-[#1f7a4d]",
  client: "bg-[rgba(201,142,18,0.14)] text-[#8a6110]",
  service: "bg-blue-100 text-blue-800",
  tank: "bg-cyan-100 text-cyan-800",
  settings: "bg-red-100 text-red-800",
};

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ targetType?: string; from?: string; to?: string }>;
}) {
  const current = await getStaff();
  if (!current || (current.role !== "administrator" && current.role !== "superadmin")) notFound();

  const sp = await searchParams;
  const targetType = TARGET_TYPES.some((t) => t.value === sp.targetType)
    ? (sp.targetType as AuditTargetType)
    : undefined;

  let entries: Awaited<ReturnType<typeof loadAuditLog>> = [];
  let dbError = false;
  try {
    entries = await loadAuditLog({ targetType, from: sp.from, to: sp.to });
  } catch {
    dbError = true;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          Account management and settings changes across the system, with who made each change
          and when. Job status changes have their own trail on each job&apos;s page.
        </p>
      </div>

      {dbError ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Database not reachable.
          </CardContent>
        </Card>
      ) : (
        <>
          <form
            method="GET"
            action="/admin/audit"
            className="grid grid-cols-2 gap-4 rounded-xl border p-4 sm:grid-cols-4"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="af-type">Area</Label>
              <select
                id="af-type"
                name="targetType"
                defaultValue={targetType ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
              >
                <option value="">All areas</option>
                {TARGET_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="af-from">From</Label>
              <input
                id="af-from"
                type="date"
                name="from"
                defaultValue={sp.from ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="af-to">To</Label>
              <input
                id="af-to"
                type="date"
                name="to"
                defaultValue={sp.to ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit" size="sm" className="btn-gold">
                Apply
              </Button>
              <Button type="button" variant="ghost" size="sm" asChild>
                <a href="/admin/audit">Reset</a>
              </Button>
            </div>
          </form>

          <Card>
            <CardHeader>
              <CardTitle className="font-display">
                {entries.length} {entries.length === 1 ? "entry" : "entries"}
                {entries.length === 200 ? " (showing most recent 200)" : ""}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {entries.length === 0 && (
                <p className="m-0 text-sm text-muted-foreground">No activity recorded for this filter yet.</p>
              )}
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-col gap-1 rounded-lg border p-3 sm:flex-row sm:items-start sm:justify-between"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className={TARGET_BADGE[e.targetType] ?? ""}>
                        {e.targetType}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">{e.action}</span>
                    </div>
                    <p className="m-0 text-sm text-navy-950">{e.summary}</p>
                    <p className="m-0 text-xs text-muted-foreground">{e.actorName}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-ink-faint">
                    {dateTimeFmt.format(new Date(e.createdAt))}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
