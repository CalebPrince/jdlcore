import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { Award, BookOpen, Plus, Users } from "lucide-react";
import { requireDb } from "@/db";
import { academyCertificates, academyCourses, academyEnrollments, academyLearners } from "@/db/schema";

export const dynamic = "force-dynamic";

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

export default async function AcademyAdminPage(){
  let stats:Awaited<ReturnType<typeof loadAcademyStats>>|null=null;
  try{stats=await loadAcademyStats();}catch{}
  return <div className="p-5 lg:p-8"><div className="mx-auto max-w-7xl"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-gold-600">Academy operations</p><h1 className="mt-2 text-3xl">Learning command center</h1><p className="mt-2 text-sm text-ink-soft">Manage courses, learners, enrolments, assessments, and credentials.</p></div><div className="flex gap-2"><Link href="/admin/academy/learners" className="rounded-full border bg-white px-5 py-3 text-sm font-bold text-navy-950">Manage learners</Link><Link href="/admin/academy/courses" className="inline-flex items-center gap-2 rounded-full bg-navy-950 px-5 py-3 text-sm font-bold text-white"><Plus className="h-4 w-4"/>Manage courses</Link></div></div>
    {!stats?<div className="mt-8 rounded-2xl border border-gold-500/40 bg-gold-500/10 p-6"><b className="text-navy-950">Academy database setup required</b><p className="mt-1 text-sm text-ink-soft">Run <code>npm run db:push</code> followed by <code>npm run db:seed:academy</code>.</p></div>:<><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat icon={Users} value={stats.learners} label="Learners" detail={`${stats.enrollments} enrolments`}/><Stat icon={BookOpen} value={stats.courses} label="Courses" detail={`${stats.published} published`}/><Stat icon={Award} value={stats.certificates} label="Certificates" detail="Issued credentials"/><Stat icon={Users} value={stats.enrollments} label="Active learning plans" detail="Across all courses"/></div><div className="mt-7 grid gap-5 md:grid-cols-2"><Link href="/admin/academy/courses" className="rounded-2xl border border-black/5 bg-white p-6 transition hover:shadow-lg"><BookOpen className="h-6 w-6 text-gold-600"/><h2 className="mt-5 text-xl">Course management</h2><p className="mt-2 text-sm leading-6 text-ink-soft">Create course records, publish learning paths, and continue into curriculum authoring.</p><span className="mt-5 inline-block text-sm font-semibold text-navy-700">Open courses →</span></Link><Link href="/admin/academy/learners" className="rounded-2xl border border-black/5 bg-white p-6 transition hover:shadow-lg"><Users className="h-6 w-6 text-gold-600"/><h2 className="mt-5 text-xl">Learner management</h2><p className="mt-2 text-sm leading-6 text-ink-soft">Review registered learners, enable or disable access, and assign published courses.</p><span className="mt-5 inline-block text-sm font-semibold text-navy-700">Open learners →</span></Link></div></>}
  </div></div>;
}
function Stat({icon:Icon,value,label,detail}:{icon:React.ElementType;value:number;label:string;detail:string}){return <div className="rounded-2xl border border-black/5 bg-white p-5"><Icon className="h-5 w-5 text-gold-600"/><p className="mt-5 font-display text-3xl font-bold text-navy-950">{value}</p><p className="text-sm font-semibold text-ink-soft">{label}</p><p className="mt-1 text-xs text-ink-faint">{detail}</p></div>}
