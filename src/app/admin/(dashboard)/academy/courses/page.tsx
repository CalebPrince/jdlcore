import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft, BookOpen, Pencil } from "lucide-react";
import { setAcademyCourseStatus } from "@/app/actions/academy-admin";
import { AcademyCourseForm } from "@/components/admin/academy-course-form";
import { requireDb } from "@/db";
import { academyCourses } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function CourseManagerPage(){
  let courses:(typeof academyCourses.$inferSelect)[]=[];
  let error=false;
  try{courses=await requireDb().select().from(academyCourses).orderBy(asc(academyCourses.createdAt));}catch{error=true;}
  return <div className="p-5 lg:p-8"><div className="mx-auto max-w-6xl"><Link href="/admin/academy" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-faint"><ArrowLeft className="h-4 w-4"/>Academy overview</Link><div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl">Courses</h1><p className="mt-2 text-sm text-ink-soft">Create, publish, and manage structured learning paths.</p></div><AcademyCourseForm/></div>
    {error?<div className="mt-7 rounded-2xl border border-gold-500/40 bg-gold-500/10 p-6 text-sm text-ink-soft">Academy tables are unavailable. Run <code>npm run db:migrate:academy</code>.</div>:<div className="mt-7 overflow-hidden rounded-2xl border border-black/5 bg-white">{courses.length?<div className="divide-y">{courses.map((course,index)=><div key={course.id} className="grid items-center gap-4 p-5 sm:grid-cols-[52px_1fr_auto]"><span className="grid h-12 w-12 place-items-center rounded-xl font-display font-bold" style={{background:`${course.accent}20`,color:course.accent}}>0{index+1}</span><div><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/academy/courses/${course.id}`} className="font-display font-semibold text-navy-950 hover:text-gold-600">{course.title}</Link><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${course.status==="published"?"bg-green-50 text-green-700":"bg-gold-500/15 text-gold-600"}`}>{course.status}</span></div><p className="mt-1 text-xs text-ink-faint">{course.code} · {course.level} · {course.estimatedMinutes} minutes</p></div><div className="flex items-center gap-2"><Link href={`/admin/academy/courses/${course.id}`} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold text-navy-800"><Pencil className="h-3.5 w-3.5"/>Curriculum</Link><form action={setAcademyCourseStatus}><input type="hidden" name="id" value={course.id}/><input type="hidden" name="status" value={course.status==="published"?"draft":"published"}/><button className="rounded-lg border px-3 py-2 text-xs font-semibold text-navy-800">{course.status==="published"?"Unpublish":"Publish"}</button></form></div></div>)}</div>:<div className="p-12 text-center"><BookOpen className="mx-auto h-8 w-8 text-ink-faint"/><p className="mt-3 font-semibold text-navy-950">No courses yet</p><p className="mt-1 text-sm text-ink-faint">Create the first course to begin.</p></div>}</div>}
  </div></div>;
}
