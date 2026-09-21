import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, PauseCircle, TriangleAlert } from "lucide-react";
import { getStaff } from "@/lib/staff-auth";
import { loadAutomationOverview, type AutomationCard } from "@/lib/automation/overview";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const STATE_STYLE: Record<AutomationCard["state"], string> = {
  on: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  always: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  shadow: "bg-[rgba(201,142,18,0.14)] text-gold-600",
  off: "bg-ink-faint/10 text-ink-soft",
};

function StateBadge({ card }: { card: AutomationCard }) {
  return (
    <Badge variant="secondary" className={STATE_STYLE[card.state]}>
      {card.stateLabel}
    </Badge>
  );
}

function HealthLine({ card }: { card: AutomationCard }) {
  if (card.kind !== "scheduled") return null;
  if (card.state === "off") {
    return (
      <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
        <PauseCircle className="h-4 w-4" aria-hidden /> Switched off, so it has nothing to do.
      </p>
    );
  }
  if (card.health === "waiting") {
    return (
      <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="h-4 w-4 shrink-0" aria-hidden /> Hasn&apos;t run yet, so there&apos;s nothing to show. It will appear after its next run.
      </p>
    );
  }
  const problem = card.health === "failed" || card.health === "late";
  const Icon = problem ? TriangleAlert : CheckCircle2;
  const color = problem ? "text-destructive" : "text-[#1f7a4d]";
  return (
    <p className={`m-0 flex items-start gap-1.5 text-sm ${color}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {card.health === "late" && "Hasn't run when expected. "}
        Last ran {card.lastRunText?.toLowerCase()}
        {card.lastResult ? `. ${card.lastResult}` : "."}
      </span>
    </p>
  );
}

function AutomationItem({ card }: { card: AutomationCard }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="m-0 font-display text-base font-bold text-navy-950">{card.name}</h3>
            <p className="m-0 mt-1 text-sm text-muted-foreground">{card.summary}</p>
          </div>
          <StateBadge card={card} />
        </div>
        <p className="m-0 text-sm">
          <span className="font-medium text-navy-950">When: </span>
          <span className="text-muted-foreground">{card.when}</span>
        </p>
        <HealthLine card={card} />
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-navy-950">What it does</summary>
          <ul className="mb-2 mt-2 list-disc pl-5 text-muted-foreground">
            {card.does.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="m-0 rounded-lg bg-[rgba(201,142,18,0.08)] p-3 text-muted-foreground">
            <span className="font-medium text-navy-950">What it never does: </span>
            {card.never}
          </p>
          {card.where && (
            <p className="m-0 mt-2">
              <Link href={card.where.href} className="font-medium text-gold-600 hover:underline">
                {card.switch ? "Change this in" : "See"} {card.where.label} &rarr;
              </Link>
            </p>
          )}
        </details>
      </CardContent>
    </Card>
  );
}

export default async function AutomationsPage() {
  const current = await getStaff();
  if (!current || (current.role !== "administrator" && current.role !== "superadmin")) notFound();

  const data = await loadAutomationOverview();
  const attention = data.scheduled.filter((c) => c.health === "failed" || c.health === "late");
  const doneForYou = data.counts.reduce((total, c) => total + c.count, 0);

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">Automations</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Everything the platform does by itself to save your team time, and what it will never do without a person. Some
          are always on; others only run once you switch them on in Settings. You can step in on any job at any time.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="m-0 text-2xl font-bold text-navy-950">{data.runningCount}</p>
            <p className="m-0 text-sm text-muted-foreground">automations running</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className={`m-0 text-2xl font-bold ${data.needsAttention > 0 ? "text-destructive" : "text-navy-950"}`}>{data.needsAttention}</p>
            <p className="m-0 text-sm text-muted-foreground">{data.needsAttention === 1 ? "needs a look" : "need a look"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="m-0 text-2xl font-bold text-navy-950">{doneForYou}</p>
            <p className="m-0 text-sm text-muted-foreground">things done for you in the last 7 days</p>
          </CardContent>
        </Card>
      </div>

      {attention.length > 0 && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="m-0 flex items-center gap-2 font-semibold text-destructive">
            <TriangleAlert className="h-4 w-4" aria-hidden />
            {attention.length === 1 ? "One automation didn't run as expected" : `${attention.length} automations didn't run as expected`}
          </p>
          <p className="m-0 mt-1 text-muted-foreground">
            {attention.map((c) => c.name).join(", ")}. Your team can carry on as normal, and the platform will try again on its
            next run. If this message stays for more than a day, please let us know.
          </p>
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 font-display text-lg font-bold text-navy-950">Runs on a schedule</h2>
          <p className="m-0 text-sm text-muted-foreground">These check in by themselves, in the morning or every hour.</p>
        </div>
        {!data.historyAvailable && (
          <p className="m-0 text-sm text-muted-foreground">
            Run history isn&apos;t available yet, so &ldquo;last ran&rdquo; can&apos;t be shown for now.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.scheduled.map((c) => (
            <AutomationItem key={c.id} card={c} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 font-display text-lg font-bold text-navy-950">Happens the moment something changes</h2>
          <p className="m-0 text-sm text-muted-foreground">
            These react straight away, for example when a job is created or a payment arrives.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {data.event.map((c) => (
            <AutomationItem key={c.id} card={c} />
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">Always done by your team, never automatic</CardTitle>
          <CardDescription>These stay with people on purpose.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="m-0 list-disc pl-5 text-sm text-muted-foreground">
            <li>Checking bank-transfer payment receipts. The platform only reminds your team when one is waiting.</li>
            <li>Sending a job back to an inspector for changes. Automatic approval can only approve, never return a job.</li>
            <li>Suspending or removing a subscriber&apos;s access.</li>
            <li>Assigning and approving jobs, unless you switch those automations on. You can switch them off again at any time.</li>
          </ul>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 font-display text-lg font-bold text-navy-950">What was done for you recently</h2>
          <p className="m-0 text-sm text-muted-foreground">The last 7 days. Every one of these is also written on the job it belongs to.</p>
        </div>
        {data.counts.length === 0 && data.activity.length === 0 ? (
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              Nothing yet. Once automations start working, you&apos;ll see them here.
            </CardContent>
          </Card>
        ) : (
          <>
            {data.counts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {data.counts.map((c) => (
                  <Badge key={c.label} variant="outline" className="px-3 py-1.5 text-xs">
                    {c.count} &middot; {c.label}
                  </Badge>
                ))}
              </div>
            )}
            {data.activity.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <ul className="m-0 list-none divide-y p-0" style={{ borderColor: "var(--border)" }}>
                    {data.activity.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-sm">
                        <Link href={`/admin/jobs/${a.jobId}`} className="font-display font-bold tracking-wide text-gold-600 hover:underline">
                          {a.ref}
                        </Link>
                        <span className="min-w-0 flex-1 text-muted-foreground">{a.text}</span>
                        <span className="text-xs text-ink-faint">{a.when}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </section>
    </div>
  );
}
