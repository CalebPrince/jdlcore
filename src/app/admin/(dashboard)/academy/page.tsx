import Link from "next/link";
import { count, desc, eq, isNotNull } from "drizzle-orm";
import { Award, BookOpen, Plus, Users } from "lucide-react";
import { requireDb } from "@/db";
import { academyCertificates, academyCourses, academyEnrollments, academyLearners } from "@/db/schema";
import { updateAcademySubscriptionPrices } from "@/app/actions/academy-admin";
import { getAcademyPlans } from "@/lib/academy-plans";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-[rgba(31,122,77,0.12)] text-[#1f7a4d]",
  past_due: "bg-[rgba(201,142,18,0.14)] text-gold-700",
  cancelled: "bg-muted text-muted-foreground",
  none: "bg-muted text-muted-foreground",
};

const nextPaymentFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

async function loadAcademyStats(){
  const database=requireDb();
  const [learners,courses,enrollments,certificates,published]=await Promise.all([
    database.select({value:count()}).from(academyLearners),
    database.select({value:count()}).from(academyCourses),
    database.select({value:count()}).from(academyEnrollments),
    database.select({value:count()}).from(academyCertificates),
    database.select({value:count()}).from(academyCourses).where(eq(academyCourses.status,"published")),
  ]);
  return {learners:learners[0].value,courses:courses[0].value,enrollments:enrollments[0].value,certificates:certificates[0].value,published:published[0].value};
}

async function loadAcademySubscribers(){
  const database=requireDb();
  return database
    .select({
      id: academyLearners.id,
      name: academyLearners.name,
      email: academyLearners.email,
      company: academyLearners.company,
      subscriptionPlan: academyLearners.subscriptionPlan,
      subscriptionStatus: academyLearners.subscriptionStatus,
      currentPeriodEnd: academyLearners.currentPeriodEnd,
    })
    .from(academyLearners)
    .where(isNotNull(academyLearners.subscriptionPlan))
    .orderBy(desc(academyLearners.currentPeriodEnd));
}

export default async function AcademyAdminPage(){
  let stats:Awaited<ReturnType<typeof loadAcademyStats>>|null=null;
  let subscribers:Awaited<ReturnType<typeof loadAcademySubscribers>>=[];
  try{stats=await loadAcademyStats();}catch{}
  try{subscribers=await loadAcademySubscribers();}catch{}
  const plans=await getAcademyPlans();
  return <div className="p-5 lg:p-8"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-gold-600">Academy operations</p><h1 className="mt-2 text-3xl">Learning command center</h1><p className="mt-2 text-sm text-ink-soft">Manage courses, learners, enrolments, assessments, and credentials.</p></div><div className="flex gap-2"><Link href="/admin/academy/learners" className="rounded-full border bg-white px-5 py-3 text-sm font-bold text-navy-950">Manage learners</Link><Link href="/admin/academy/courses" className="inline-flex items-center gap-2 rounded-full bg-navy-950 px-5 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4"/>Manage courses</Link></div></div>
    {!stats?<div className="mt-8 rounded-2xl border border-gold-500/40 bg-gold-500/10 p-6"><b className="text-navy-950">Academy is temporarily unavailable</b><p className="mt-1 text-sm text-ink-soft">Please try again shortly.</p></div>:<><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={Users} value={stats.learners} label="Learners" detail={`${stats.enrollments} enrolments`}/><Stat icon={BookOpen} value={stats.courses} label="Courses" detail={`${stats.published} published`}/><Stat icon={Award} value={stats.certificates} label="Certificates" detail="Issued credentials"/><Stat icon={Users} value={stats.enrollments} label="Active learning plans" detail="Across all courses"/></div><div className="mt-7 grid gap-5 md:grid-cols-2"><Link href="/admin/academy/courses" className="rounded-2xl border border-black/5 bg-white p-6 transition hover:shadow-lg"><BookOpen className="h-6 w-6 text-gold-600"/><h2 className="mt-5 text-xl">Course management</h2><p className="mt-2 text-sm leading-6 text-ink-soft">Create course records, publish learning paths, and continue into curriculum authoring.</p><span className="mt-5 inline-block text-sm font-semibold text-navy-700">Open courses →</span></Link><Link href="/admin/academy/learners" className="rounded-2xl border border-black/5 bg-white p-6 transition hover:shadow-lg"><Users className="h-6 w-6 text-gold-600"/><h2 className="mt-5 text-xl">Learner management</h2><p className="mt-2 text-sm leading-6 text-ink-soft">Review registered learners, enable or disable access, and assign published courses.</p><span className="mt-5 inline-block text-sm font-semibold text-navy-700">Open learners →</span></Link></div></>}
    <section className="mt-7 rounded-2xl border border-black/5 bg-white p-6"><p className="text-xs font-bold uppercase tracking-[.18em] text-gold-600">Subscription pricing</p><h2 className="mt-2 text-xl">Academy membership</h2><p className="mt-2 text-sm text-ink-soft">Set the monthly and yearly prices charged through Paystack.</p><form action={updateAcademySubscriptionPrices} className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto]"><label className="text-xs font-semibold">Monthly price (GHS)<input name="monthly" type="number" min="1" step="0.01" defaultValue={plans.monthly.priceCents/100} className="mt-1.5 h-11 w-full rounded-xl border px-3 text-sm" required/></label><label className="text-xs font-semibold">Yearly price (GHS)<input name="yearly" type="number" min="1" step="0.01" defaultValue={plans.yearly.priceCents/100} className="mt-1.5 h-11 w-full rounded-xl border px-3 text-sm" required/></label><button className="btn-gold self-end px-5 py-3">Save prices</button></form></section>

    <Card className="mt-7">
      <CardHeader>
        <CardTitle className="font-display">Subscribers</CardTitle>
        <CardDescription>
          {subscribers.length === 0
            ? "No paid Academy subscribers yet."
            : `${subscribers.length} paid ${subscribers.length === 1 ? "subscriber" : "subscribers"}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {subscribers.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Subscribers will show up here once someone pays for Academy membership.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next payment due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscribers.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {s.name}
                      {s.company && <span className="block text-xs text-muted-foreground">{s.company}</span>}
                    </TableCell>
                    <TableCell className="text-xs">{s.email}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs font-semibold capitalize">
                      {s.subscriptionPlan}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={STATUS_BADGE[s.subscriptionStatus] ?? ""}>
                        {s.subscriptionStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {s.currentPeriodEnd ? nextPaymentFmt.format(new Date(s.currentPeriodEnd)) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  </div></div>;
}
function Stat({icon:Icon,value,label,detail}:{icon:React.ElementType;value:number;label:string;detail:string}){return <div className="rounded-2xl border border-black/5 bg-white p-5"><Icon className="h-5 w-5 text-gold-600"/><p className="mt-5 font-display text-3xl font-bold text-navy-950">{value}</p><p className="text-sm font-semibold text-ink-soft">{label}</p><p className="mt-1 text-xs text-ink-faint">{detail}</p></div>}
