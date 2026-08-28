import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, submissions } from "@/db/schema";
import { getStaff } from "@/lib/staff-auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConvertQuoteSheet } from "@/components/admin/convert-quote-sheet";

const TYPE_LABELS: Record<string, string> = {
  quote: "Quote request",
  contact: "Contact message",
  chat_handoff: "Chat handoff",
  waitlist_analytics: "Analytics waitlist",
  waitlist_academy: "Academy waitlist",
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "quote", label: "Quote requests" },
  { value: "contact", label: "Messages" },
  { value: "chat_handoff", label: "Chat handoffs" },
  { value: "waitlist_analytics", label: "Analytics waitlist" },
  { value: "waitlist_academy", label: "Academy waitlist" },
];

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const current = await getStaff();
  if (!current) notFound();

  const { type } = await searchParams;
  const activeType = type && type !== "all" ? type : null;

  let rows: Awaited<ReturnType<typeof loadRows>> = [];
  let clientOptions: Awaited<ReturnType<typeof loadClients>> = [];
  let error: string | null = null;
  try {
    rows = await loadRows(activeType);
    clientOptions = await loadClients();
  } catch (err) {
    error =
      err instanceof Error && err.message.includes("DATABASE_URL")
        ? "Database not connected yet — add your Supabase DATABASE_URL to .env and run `npm run db:push`."
        : "Could not reach the database.";
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">
          Inbox
        </h1>
        <p className="text-sm text-muted-foreground">
          Quote requests, messages, waitlists, and chat handoffs submitted from
          the site.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value === "all" ? "/admin/inbox" : `/admin/inbox?type=${f.value}`}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
              (type ?? "all") === f.value
                ? "border-navy-950 bg-navy-950 text-paper"
                : "bg-white text-ink-soft hover:text-navy-950"
            }`}
            style={{ borderColor: "var(--border)" }}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">
            {activeType ? TYPE_LABELS[activeType] ?? activeType : "All submissions"}
          </CardTitle>
          <CardDescription>
            {error ? null : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              {error}
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nothing here yet. Submissions from the site forms will appear in
              this inbox.
            </p>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead className="w-[130px]">Name</TableHead>
                  <TableHead className="w-[150px]">Contact</TableHead>
                  <TableHead className="w-[130px]">Service / Topic</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-normal text-xs">
                      {new Date(r.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {TYPE_LABELS[r.type] ?? r.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal break-words font-medium">
                      {r.name}
                      {r.company ? (
                        <span className="block text-xs text-muted-foreground">
                          {r.company}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-normal break-words text-xs">
                      {r.phone && <span className="block">{r.phone}</span>}
                      {r.email && <span className="block break-all">{r.email}</span>}
                    </TableCell>
                    <TableCell className="whitespace-normal break-words text-xs">{r.service ?? "—"}</TableCell>
                    <TableCell className="whitespace-normal break-words text-xs text-muted-foreground">
                      {r.message ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.type === "quote" &&
                        (r.convertedJobId ? (
                          <Link
                            href={`/admin/jobs/${r.convertedJobId}`}
                            className="inline-block whitespace-nowrap rounded-full bg-[rgba(31,122,77,0.1)] px-3 py-1 text-xs font-semibold text-[#1f7a4d] hover:bg-[rgba(31,122,77,0.16)]"
                          >
                            Converted ✓
                          </Link>
                        ) : (
                          <ConvertQuoteSheet
                            submission={{
                              id: r.id,
                              name: r.name,
                              company: r.company,
                              phone: r.phone,
                              email: r.email,
                              service: r.service,
                              message: r.message,
                            }}
                            clients={clientOptions}
                          />
                        ))}
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

async function loadRows(type: string | null) {
  if (!db) throw new Error("DATABASE_URL is not set.");
  const query = db.select().from(submissions);
  const rows = await (type
    ? query.where(eq(submissions.type, type))
    : query
  ).orderBy(desc(submissions.createdAt)).limit(200);
  return rows;
}

async function loadClients() {
  if (!db) return [];
  return db
    .select({
      id: clients.id,
      name: clients.name,
      company: clients.company,
      email: clients.email,
    })
    .from(clients)
    .orderBy(asc(clients.name))
    .limit(500);
}
