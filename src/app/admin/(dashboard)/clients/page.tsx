import { desc } from "drizzle-orm";
import { requireDb } from "@/db";
import { clients } from "@/db/schema";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toggleClientActive } from "@/app/actions/portal-admin";
import { CreateClientForm, ResetPasswordForm } from "@/components/admin/portal-client-forms";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export default async function AdminClientsPage() {
  let list: Awaited<ReturnType<typeof loadClients>> = [];
  let dbError = false;
  try {
    list = await loadClients();
  } catch {
    dbError = true;
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Clients</h1>
        <p className="text-sm text-muted-foreground">
          Portal accounts for client companies. Deactivated accounts cannot sign
          in but keep their job history.
        </p>
      </div>

      <CreateClientForm />

      {dbError ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Database not reachable.
          </CardContent>
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No clients yet — create the first one above.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">
              Client Accounts ({list.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {list.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border p-4"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-[180px] flex-1">
                  <p className="m-0 text-sm font-semibold text-navy-950">
                    {c.name}
                    {c.company && (
                      <span className="ml-2 font-normal text-muted-foreground">
                        {c.company}
                      </span>
                    )}
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                    {c.email}
                    {c.phone ? ` · ${c.phone}` : ""}
                  </p>
                </div>
                <Badge variant={c.active ? "secondary" : "outline"}>
                  {c.active ? "Active" : "Disabled"}
                </Badge>
                <span className="text-xs text-ink-faint">
                  Added {dateFmt.format(new Date(c.createdAt))}
                </span>
                <ResetPasswordForm clientId={c.id} />
                <form action={toggleClientActive}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                  <Button type="submit" variant="ghost" size="sm">
                    {c.active ? "Disable" : "Enable"}
                  </Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function loadClients() {
  return requireDb().select().from(clients).orderBy(desc(clients.createdAt));
}
