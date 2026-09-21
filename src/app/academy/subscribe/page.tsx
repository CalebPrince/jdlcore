import Link from "next/link";
import { Check } from "lucide-react";
import { redirect } from "next/navigation";
import { startAcademySubscription } from "@/app/actions/academy-subscribe";
import { getAcademyLearner } from "@/lib/academy-auth";
import { getAcademyPlans } from "@/lib/academy-plans";

export default async function AcademySubscribePage({ searchParams }: { searchParams: Promise<{ error?: string; required?: string }> }) {
  const learner = await getAcademyLearner();
  if (!learner) redirect("/academy/login");
  const query = await searchParams;
  const academyPlans = await getAcademyPlans();
  const monthlyAnnualCents = academyPlans.monthly.priceCents * 12;
  const yearlySavingsPct = monthlyAnnualCents > 0 ? Math.round((1 - academyPlans.yearly.priceCents / monthlyAnnualCents) * 100) : 0;
  return <main className="min-h-screen bg-paper-deep px-5 py-16"><div className="mx-auto max-w-4xl"><Link href="/academy" className="text-sm font-semibold text-ink-soft">← Academy home</Link><div className="mt-8 text-center"><p className="eyebrow">Academy membership</p><h1 className="mt-3 text-4xl">Choose how you learn.</h1><p className="mx-auto mt-4 max-w-xl text-ink-soft">Full access to Academy courses, sequential assessments, progress tracking, and certificates.</p>{query.required?<p className="mt-4 text-sm font-semibold text-gold-700">An active subscription is required to enrol.</p>:null}{query.error?<p className="mt-4 text-sm font-semibold text-red-700">Payment was not completed. Please try again.</p>:null}</div><div className="mt-10 grid gap-5 md:grid-cols-2">{Object.values(academyPlans).map((plan)=><section key={plan.id} className={`relative rounded-3xl border bg-white p-7 ${plan.id==="yearly"?"border-gold-500 shadow-lg":"border-black/10"}`}>{plan.id==="yearly"&&yearlySavingsPct>0?<span className="absolute -top-3 right-6 rounded-full bg-gold-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-navy-950 shadow">Save {yearlySavingsPct}%</span>:null}<p className="text-xs font-bold uppercase tracking-widest text-gold-700">{plan.label}</p><p className="mt-5 font-display text-4xl font-bold text-navy-950">GHS {(plan.priceCents/100).toLocaleString()}</p><p className="mt-1 text-sm text-ink-faint">per {plan.id==="monthly"?"month":"year"}</p><ul className="mt-7 space-y-3 text-sm text-ink-soft"><li className="flex gap-2"><Check className="h-4 w-4 text-green-700"/>All Academy courses</li><li className="flex gap-2"><Check className="h-4 w-4 text-green-700"/>Assessments and certificates</li><li className="flex gap-2"><Check className="h-4 w-4 text-green-700"/>Cancel through Paystack</li></ul><form action={startAcademySubscription} className="mt-8"><input type="hidden" name="plan" value={plan.id}/><button className="btn-gold w-full py-3">Choose {plan.label}</button></form></section>)}</div></div></main>;
}
