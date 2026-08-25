import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, BookOpen, ClipboardCheck, Gauge, Users } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getContactSettings } from "@/lib/settings";
import { academyCourses } from "@/lib/academy-data";

export const metadata: Metadata = { title: "JDL Core Academy", description: "Practical inspection and petroleum operations training, built by working inspectors." };

export default async function AcademyPage() {
  const settings = await getContactSettings();
  return <>
    <SiteHeader cta={{ href: "/academy/lms", label: "Enter LMS" }} />
    <main>
      <section className="relative overflow-hidden bg-navy-950 py-24 text-white lg:py-32">
        <div className="absolute inset-0 opacity-25" style={{backgroundImage:"linear-gradient(rgba(255,255,255,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.08) 1px,transparent 1px)",backgroundSize:"48px 48px"}} />
        <div className="wrap relative grid items-center gap-14 lg:grid-cols-[1fr_430px]">
          <div><p className="text-xs font-bold uppercase tracking-[.22em] text-gold-300">Built on the field, for the field</p><h1 className="mt-5 max-w-3xl text-[clamp(2.8rem,6vw,5.8rem)] font-bold leading-[.96] text-white">Know the numbers.<br/><span className="text-gold-500">Trust the work.</span></h1><p className="mt-7 max-w-xl text-lg leading-8 text-white/65">Practical training in petroleum inspection, measurement, and cargo operations—designed by inspectors who do the work every day.</p><div className="mt-9 flex flex-wrap gap-3"><Link href="/academy/courses" className="btn-gold btn-gold-lg">Explore courses <ArrowRight className="h-4 w-4" /></Link><Link href="/academy/lms" className="rounded-full border border-white/20 px-7 py-4 font-semibold text-white hover:bg-white/10">View learner dashboard</Link></div></div>
          <div className="relative rounded-[26px] border border-white/15 bg-white/8 p-6 backdrop-blur"><div className="flex items-start justify-between"><span className="text-xs font-bold uppercase tracking-[.18em] text-gold-300">Field competency</span><Gauge className="h-6 w-6 text-gold-300" /></div><p className="mt-12 font-display text-7xl font-bold text-white">92<span className="text-2xl text-gold-300">%</span></p><p className="mt-2 text-sm text-white/55">Average assessment score after course completion</p><div className="mt-8 grid grid-cols-2 gap-3 border-t border-white/10 pt-5"><Metric value="156" label="Active learners"/><Metric value="3" label="Specialist paths"/></div></div>
        </div>
      </section>
      <section className="wrap py-20"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">Current catalogue</p><h2 className="text-3xl">Training that follows the operation</h2></div><Link href="/academy/courses" className="link-arrow">View all courses →</Link></div><div className="mt-9 grid gap-5 md:grid-cols-3">{academyCourses.map((course) => <Link href={`/academy/courses#${course.slug}`} key={course.slug} className="group rounded-2xl border border-black/10 bg-white p-6 transition hover:-translate-y-1 hover:shadow-xl"><div className="flex items-center justify-between"><span className="text-xs font-bold tracking-widest text-ink-faint">{course.code}</span><span className="h-3 w-3 rounded-full" style={{background:course.accent}} /></div><h3 className="mt-8 text-xl">{course.title}</h3><p className="mt-3 text-sm leading-6 text-ink-soft">{course.summary}</p><div className="mt-6 flex items-center justify-between border-t pt-4 text-xs text-ink-faint"><span>{course.lessons} lessons · {course.duration}</span><ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div></Link>)}</div></section>
      <section className="bg-paper-deep py-20"><div className="wrap grid gap-10 lg:grid-cols-[.75fr_1.25fr]"><div><p className="eyebrow">The JDL method</p><h2 className="text-3xl">Competence is observable.</h2><p className="mt-4 text-ink-soft">Every learning path moves from explanation to calculation to a scenario drawn from real operations.</p></div><div className="grid gap-px overflow-hidden rounded-2xl bg-black/10 sm:grid-cols-3"><Method icon={BookOpen} title="Learn" text="Concise concepts and annotated field examples."/><Method icon={ClipboardCheck} title="Check" text="Knowledge tests with clear answer reasoning."/><Method icon={BadgeCheck} title="Demonstrate" text="Practical assessments tied to job skills."/></div></div></section>
      <section className="wrap py-20"><div className="rounded-[28px] bg-gold-500 p-8 lg:flex lg:items-center lg:justify-between lg:p-12"><div><Users className="mb-4 h-8 w-8 text-navy-950"/><h2 className="text-3xl">Training a whole operations team?</h2><p className="mt-2 max-w-2xl text-navy-950/70">Create role-based learning plans, monitor completion, and keep one evidence trail for your workforce.</p></div><Link href="/contact" className="mt-6 inline-flex rounded-full bg-navy-950 px-7 py-4 font-bold text-white lg:mt-0">Discuss team training</Link></div></section>
    </main>
    <SiteFooter settings={settings} brandLine="Practical petroleum operations education, built by working inspectors." copyrightName="JDL Core Academy" divisionLinks={[{href:"/",label:"JDL Core Home"},{href:"/inspection",label:"Inspection Services"},{href:"/analytics",label:"Analytics"}]} thisDivision={[{href:"/academy/courses",label:"Courses"},{href:"/academy/lms",label:"Learner LMS"}]} />
  </>;
}

function Metric({value,label}:{value:string;label:string}) { return <div><b className="font-display text-xl text-white">{value}</b><small className="block text-white/45">{label}</small></div> }
function Method({icon:Icon,title,text}:{icon:React.ElementType;title:string;text:string}) { return <div className="bg-white p-6"><Icon className="h-6 w-6 text-gold-600"/><h3 className="mt-7">{title}</h3><p className="mt-2 text-sm leading-6 text-ink-soft">{text}</p></div> }
