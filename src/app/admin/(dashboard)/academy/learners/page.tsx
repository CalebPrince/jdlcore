import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, UserRound } from "lucide-react";
import { enrollAcademyLearner, setAcademyLearnerStatus } from "@/app/actions/academy-admin";
import { requireDb } from "@/db";
import { academyCourses, academyEnrollments, academyLearners } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function AcademyLearnersPage(){
  let learners: (typeof academyLearners.$inferSelect)[] = [];
  let courses: (typeof academyCourses.$inferSelect)[] = [];
  let enrollments: {learnerId:number;courseTitle:string}[] = [];
  let error = false;
  try {
    const database = requireDb();
    [learners,courses,enrollments] = await Promise.all([
      database.select().from(academyLearners).orderBy(asc(academyLearners.name)),
      database.select().from(academyCourses).where(eq(academyCourses.status,"published")),
      database.select({learnerId:academyEnrollments.learnerId,courseTitle:academyCourses.title}).from(academyEnrollments).innerJoin(academyCourses,eq(academyEnrollments.courseId,academyCourses.id)),
    ]);
  } catch { error = true; }
  return <div className="p-5 lg:p-8"><div className="mx-auto max-w-6xl"><Link href="/admin/academy" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-faint"><ArrowLeft className="h-4 w-4"/>Academy overview</Link><div className="mt-5"><h1 className="text-3xl">Learners</h1><p className="mt-2 text-sm text-ink-soft">Manage access and course enrolments.</p></div>{error?<p className="mt-7 rounded-2xl border p-6 text-sm text-ink-soft">Academy tables are not available yet.</p>:<div className="mt-7 overflow-hidden rounded-2xl border border-black/5 bg-white">{learners.length?<div className="divide-y">{learners.map(learner=><div key={learner.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr_auto]"><div><b className="block text-sm text-navy-950">{learner.name}</b><small className="text-ink-faint">{learner.email} · {learner.role}</small></div><div><p className="text-xs text-ink-faint">{enrollments.filter(e=>e.learnerId===learner.id).map(e=>e.courseTitle).join(", ")||"No enrolments"}</p>{courses.length?<form action={enrollAcademyLearner} className="mt-2 flex gap-2"><input type="hidden" name="learnerId" value={learner.id}/><select name="courseId" className="h-8 rounded-lg border px-2 text-xs">{courses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select><button className="rounded-lg border px-2 text-xs font-semibold">Enrol</button></form>:null}</div><form action={setAcademyLearnerStatus}><input type="hidden" name="id" value={learner.id}/><input type="hidden" name="status" value={learner.status==="active"?"disabled":"active"}/><button className="rounded-lg border px-3 py-2 text-xs font-semibold">{learner.status==="active"?"Disable":"Enable"}</button></form></div>)}</div>:<div className="p-12 text-center"><UserRound className="mx-auto h-8 w-8 text-ink-faint"/><p className="mt-3 font-semibold">No learner accounts yet</p></div>}</div>}</div></div>;
}
