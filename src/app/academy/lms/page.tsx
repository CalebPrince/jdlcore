import Link from "next/link";
import { ArrowRight, Award, BookOpen, Clock3, Flame, Play } from "lucide-react";
import { academyCourses } from "@/lib/academy-data";

export default function LearningDashboard() {
  const course = academyCourses[0];
  return <main className="p-5 lg:p-9">
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-gold-600">Tuesday, 25 August</p><h1 className="mt-2 text-3xl font-bold">Good morning, Kwame.</h1><p className="mt-2 text-ink-soft">You’re one focused session away from completing Module 3.</p></div><div className="flex gap-3"><Stat icon={Flame} value="4 days" label="Learning streak" /><Stat icon={Clock3} value="6.8 hrs" label="Time invested" /></div></div>
      <section className="relative overflow-hidden rounded-[28px] bg-navy-950 p-6 text-white shadow-[0_24px_70px_rgba(8,24,38,.18)] lg:p-9">
        <div className="absolute right-0 top-0 h-full w-1/2 opacity-20" style={{backgroundImage:"repeating-linear-gradient(110deg,transparent 0 28px,rgba(238,176,43,.45) 29px 30px)"}} />
        <div className="relative max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.2em] text-gold-300">Continue where you stopped · {course.code}</p><h2 className="mt-3 text-3xl text-white">Reference heights &amp; datum plates</h2><p className="mt-3 text-sm leading-6 text-white/60">Understand where every tank measurement begins—and how a 2 mm reference error follows the entire calculation.</p><div className="mt-7 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[68%] rounded-full bg-gold-500" /></div><div className="mt-2 flex justify-between text-xs text-white/45"><span>Module 3 of 6</span><span>68% complete</span></div><Link href="/academy/lms/courses/tank-gauging/lesson-1" className="mt-7 inline-flex items-center gap-2 rounded-full bg-gold-500 px-6 py-3 text-sm font-bold text-navy-950"><Play className="h-4 w-4 fill-current" /> Resume lesson</Link></div>
      </section>
      <div className="mt-8 grid gap-7 xl:grid-cols-[1fr_340px]">
        <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl">Your learning plan</h2><Link href="/academy/courses" className="text-sm font-semibold text-navy-700">Browse library →</Link></div><div className="space-y-3">{academyCourses.slice(0,2).map((item) => <Link key={item.slug} href={`/academy/lms/courses/${item.slug}`} className="group flex items-center gap-4 rounded-2xl border border-black/5 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl text-sm font-bold" style={{backgroundColor:`${item.accent}22`,color:item.accent}}>{item.code.slice(-4)}</span><span className="min-w-0 flex-1"><b className="block truncate text-sm text-navy-950">{item.title}</b><small className="text-ink-faint">{item.lessons} lessons · {item.duration}</small><span className="mt-2 block h-1 rounded bg-black/5"><span className="block h-full rounded bg-navy-800" style={{width:`${item.progress}%`}} /></span></span><ArrowRight className="h-4 w-4 text-ink-faint transition group-hover:translate-x-1" /></Link>)}</div></section>
        <aside id="certificates" className="rounded-2xl border border-black/5 bg-white p-6"><Award className="h-8 w-8 text-gold-600" /><h2 className="mt-4 text-lg">Next milestone</h2><p className="mt-2 text-sm leading-6 text-ink-soft">Score 80% or higher in the Tank Gauging field assessment to earn your first JDL credential.</p><div className="mt-6 flex items-center gap-3 border-t pt-5"><BookOpen className="h-5 w-5 text-navy-700" /><div><b className="block text-sm">8 of 12 lessons</b><small className="text-ink-faint">Keep going</small></div></div></aside>
      </div>
    </div>
  </main>;
}

function Stat({ icon: Icon, value, label }: { icon: React.ElementType; value: string; label: string }) { return <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-white px-4 py-3"><Icon className="h-5 w-5 text-gold-600" /><span><b className="block text-sm text-navy-950">{value}</b><small className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</small></span></div> }
