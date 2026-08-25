import { desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { requireDb } from "@/db";
import { analyticsChats, analyticsDailyUsage, analyticsMessages, analyticsUsers, clients, knowledgeDocuments, submissions } from "@/db/schema";
import {
  setAnalyticsUserStatus,
  deleteAnalyticsUser,
  deleteKnowledgeDocument,
  setAnalyticsUserDailyLimit,
  setAnalyticsUserClient,
} from "@/app/actions/analytics-admin";
import {
  AnalyticsGrantSheet,
  ConfirmSubmitButton,
  KnowledgeUploadForm,
} from "@/components/admin/analytics-admin-forms";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics Access | JDL Core Admin" };

const STATUS_BADGE: Record<string, string> = {
  active: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  invited: "bg-[rgba(201,142,18,0.14)] text-gold-700",
  disabled: "bg-muted text-muted-foreground",
};

export default async function AdminAnalyticsPage() {
  let waitlist: {
    id: number;
    name: string;
    email: string | null;
    createdAt: Date;
    userId: number | null;
    userStatus: string | null;
  }[] = [];
  let users: {
    id: number;
    name: string;
    email: string;
    company: string | null;
    status: string;
    lastLoginAt: Date | null;
    messages: number;
    dailyLimit: number;
    usedToday: number;
    clientId: number | null;
  }[] = [];
  let knowledge: (typeof knowledgeDocuments.$inferSelect)[] = [];
  let clientOptions: { id: number; label: string }[] = [];
  try {
    const database = requireDb();
    const today = new Date().toISOString().slice(0, 10);
    const [wlRows, userRows, knowledgeRows, usageRows, clientRows] = await Promise.all([
      database
        .select({
          id: submissions.id,
          name: submissions.name,
          email: submissions.email,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .where(eqType("waitlist_analytics"))
        .orderBy(desc(submissions.createdAt))
        .limit(100),
      database
        .select({
          id: analyticsUsers.id,
          name: analyticsUsers.name,
          email: analyticsUsers.email,
          company: analyticsUsers.company,
          status: analyticsUsers.status,
          lastLoginAt: analyticsUsers.lastLoginAt,
          dailyLimit: analyticsUsers.dailyLimit,
          clientId: analyticsUsers.clientId,
        })
        .from(analyticsUsers)
        .orderBy(desc(analyticsUsers.createdAt))
        .limit(200),
      database.select().from(knowledgeDocuments).orderBy(desc(knowledgeDocuments.createdAt)).limit(100),
      database.select({ userId: analyticsDailyUsage.userId, count: analyticsDailyUsage.messageCount }).from(analyticsDailyUsage).where(eq(analyticsDailyUsage.usageDate, today)),
      database.select({ id: clients.id, name: clients.name, company: clients.company }).from(clients).where(eq(clients.active, true)).orderBy(clients.company, clients.name),
    ]);
    knowledge = knowledgeRows;
    clientOptions = clientRows.map((client) => ({ id: client.id, label: client.company || client.name }));

    const byEmail = new Map(userRows.map((u) => [u.email.toLowerCase(), u]));
    waitlist = wlRows.map((r) => {
      const u = r.email ? byEmail.get(r.email.toLowerCase()) : undefined;
      return { ...r, userId: u?.id ?? null, userStatus: u?.status ?? null };
    });

    const msgCounts = await messageCounts(database);
    const todayByUser = new Map(usageRows.map((row) => [row.userId, row.count]));
    users = userRows.map((u) => ({ ...u, messages: msgCounts.get(u.id) ?? 0, usedToday: todayByUser.get(u.id) ?? 0 }));
  } catch (err) {
    console.error("admin analytics page:", err);
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy-950">Analytics Access</h1>
          <p className="text-sm text-muted-foreground">
            Grant beta access to waitlist signups and manage subscribers.
          </p>
        </div>
        <div className="flex gap-2"><Button asChild size="sm" variant="outline"><Link href="/admin/analytics/reports"><BarChart3 className="h-4 w-4" />Reports</Link></Button><AnalyticsGrantSheet label="+ Grant Access" /></div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Knowledge base</CardTitle>
          <CardDescription>Upload trusted industry material used to ground subscriber answers. PDF and text-based files up to 8 MB are supported.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <KnowledgeUploadForm clients={clientOptions} />
          {knowledge.length > 0 && (
            <Table>
              <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Audience</TableHead><TableHead>Status</TableHead><TableHead>Added</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {knowledge.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.title}{doc.error && <span className="block max-w-xl text-xs font-normal text-red-700">{doc.error}</span>}</TableCell>
                    <TableCell className="text-xs">{doc.scope === "global" ? "All subscribers" : clientOptions.find((client) => client.id === doc.clientId)?.label ?? "Private client"}</TableCell>
                    <TableCell><Badge variant="secondary" className={doc.status === "ready" ? STATUS_BADGE.active : doc.status === "failed" ? "bg-red-50 text-red-700" : STATUS_BADGE.invited}>{doc.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleDateString("en-GB")}</TableCell>
                    <TableCell className="text-right"><form action={deleteKnowledgeDocument}><input type="hidden" name="documentId" value={doc.id} /><ConfirmSubmitButton>Remove</ConfirmSubmitButton></form></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Subscribers</CardTitle>
          <CardDescription>
            {users.length === 0
              ? "Nobody has been granted access yet."
              : `${users.length} ${users.length === 1 ? "account" : "accounts"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Grant access to your first Analytics subscriber above.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Private library</TableHead>
                  <TableHead>Usage today</TableHead>
                  <TableHead>Daily limit</TableHead>
                  <TableHead>Last login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {u.name}
                      {u.company && (
                        <span className="block text-xs text-muted-foreground">{u.company}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_BADGE[u.status] ?? ""}>
                        {u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <span className={u.usedToday >= u.dailyLimit ? "font-bold text-red-700" : ""}>{u.usedToday}</span>
                      <span className="text-muted-foreground"> / {u.dailyLimit}</span>
                      <span className="block text-[10px] text-muted-foreground">{u.messages} total messages</span>
                    </TableCell>
                    <TableCell>
                      <form action={setAnalyticsUserClient} className="flex items-center gap-1"><input type="hidden" name="userId" value={u.id} /><select name="clientId" defaultValue={u.clientId ?? ""} className="h-8 max-w-36 rounded-md border bg-white px-2 text-xs"><option value="">Global only</option>{clientOptions.map((client) => <option key={client.id} value={client.id}>{client.label}</option>)}</select><Button type="submit" size="sm" variant="outline" className="h-8 px-2 text-xs">Link</Button></form>
                    </TableCell>
                    <TableCell>
                      <form action={setAnalyticsUserDailyLimit} className="flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <input name="dailyLimit" type="number" min="1" max="1000" defaultValue={u.dailyLimit} className="h-8 w-20 rounded-md border bg-white px-2 text-xs tabular-nums" aria-label={`Daily message limit for ${u.name}`} />
                        <Button type="submit" size="sm" variant="outline" className="h-8 px-2 text-xs">Save</Button>
                      </form>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {u.lastLoginAt
                        ? new Date(u.lastLoginAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                          })
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        {u.status === "active" ? (
                          <form action={setAnalyticsUserStatus}>
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="status" value="disabled" />
                            <Button type="submit" size="sm" variant="ghost" className="h-8 px-2 text-xs">
                              Disable
                            </Button>
                          </form>
                        ) : (
                          <form action={setAnalyticsUserStatus}>
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="status" value="active" />
                            <Button type="submit" size="sm" variant="ghost" className="h-8 px-2 text-xs">
                              Enable
                            </Button>
                          </form>
                        )}
                        <AnalyticsGrantSheet label="Re-invite" variant="ghost" defaults={{ name: u.name, email: u.email, company: u.company }} />
                        <form action={deleteAnalyticsUser}>
                          <input type="hidden" name="userId" value={u.id} />
                          <ConfirmSubmitButton>Remove</ConfirmSubmitButton>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Waitlist</CardTitle>
          <CardDescription>
            People who asked to be notified when Analytics launches.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {waitlist.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No waitlist signups yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waitlist.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(w.createdAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="font-medium">{w.name}</TableCell>
                    <TableCell className="text-xs">{w.email ?? "—"}</TableCell>
                    <TableCell>
                      {w.userStatus ? (
                        <Badge variant="secondary" className={STATUS_BADGE[w.userStatus] ?? ""}>
                          {w.userStatus}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-navy-100 text-navy-800">
                          pending
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        {!w.userId && w.email && (
                          <AnalyticsGrantSheet
                            label="Grant Access"
                            defaults={{ name: w.name, email: w.email }}
                          />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function eqType(type: string) {
  return eq(submissions.type, type);
}

async function messageCounts(
  database: NonNullable<ReturnType<typeof requireDb>>,
): Promise<Map<number, number>> {
  const rows = await database
    .select({ userId: analyticsChats.userId, total: sql<number>`count(*)::int` })
    .from(analyticsMessages)
    .innerJoin(analyticsChats, eq(analyticsMessages.chatId, analyticsChats.id))
    .groupBy(analyticsChats.userId);
  return new Map(rows.map((r) => [r.userId, Number(r.total)]));
}
