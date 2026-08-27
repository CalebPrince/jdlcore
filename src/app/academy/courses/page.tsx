import Link from "next/link";
import { ArrowRight, Clock3, GraduationCap, Layers3 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAcademyLearner } from "@/lib/academy-auth";
import { listPublishedAcademyCoursesWithCounts } from "@/lib/academy";

export const dynamic = "force-dynamic";

export default async function CourseLibraryPage() {
  const [learner, courses] = await Promise.all([
    getAcademyLearner(),
    listPublishedAcademyCoursesWithCounts(),
  ]);

  return (
    <>
      <SiteHeader
        logo={null}
        logoAlt="JDL Core Academy"
        homeHref="/academy"
        navLinks={[
          { href: "/academy", label: "Home" },
          { href: "/academy/courses", label: "Courses" },
          { href: "/academy/lms", label: "Learner LMS" },
        ]}
        cta={{
          href: learner ? "/academy/lms" : "/academy/login",
          label: learner ? "Enter LMS" : "Learner sign in",
        }}
      />
      <main className="marketing-main min-h-screen pb-24">
        <section className="marketing-hero border-b border-black/5 py-18">
          <div className="wrap relative">
            <p className="eyebrow">Course library</p>
            <h1 className="max-w-3xl text-[clamp(2.5rem,6vw,4.6rem)] font-semibold leading-[1.02]">
              Build the judgement behind every measurement.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-soft">
              Structured learning paths for inspectors, terminal operators,
              surveyors, and the teams who rely on their reports.
            </p>
          </div>
        </section>

        <section className="wrap py-12">
          <div className="mb-8 flex gap-2 overflow-x-auto pb-2" aria-label="Course levels">
            <Filter active label="All courses" />
            <Filter label="Foundation" />
            <Filter label="Intermediate" />
            <Filter label="Professional" />
          </div>

          {courses.length ? (
            <div className="space-y-5">
              {courses.map((course, index) => (
                <Card
                  id={course.slug}
                  key={course.id}
                  className="grid gap-0 overflow-hidden rounded-3xl border border-navy-900/8 bg-white py-0 lg:grid-cols-[220px_1fr_auto]"
                >
                  <div className="relative grid min-h-44 place-items-center p-7" style={{ background: `${course.accent}20` }}>
                    <span className="font-display text-5xl font-bold" style={{ color: course.accent }}>0{index + 1}</span>
                    <span className="absolute bottom-4 left-5 text-[10px] font-bold uppercase tracking-[.2em] text-navy-950/50">{course.code}</span>
                  </div>
                  <CardContent className="p-6 lg:p-8">
                    <div className="flex flex-wrap gap-2">
                      <Tag icon={GraduationCap} text={course.level} />
                      <Tag icon={Clock3} text={`${course.estimatedMinutes} min`} />
                      <Tag icon={Layers3} text={`${course.lessonCount} lessons`} />
                    </div>
                    <h2 className="mt-5 text-2xl">{course.title}</h2>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">{course.summary}</p>
                    <p className="mt-4 text-xs font-semibold text-navy-700">Certificate · Practice exercises · Final assessment</p>
                  </CardContent>
                  <div className="flex items-center p-6 lg:border-l lg:border-navy-900/8 lg:p-8">
                    <Button asChild size="lg" className="h-12 rounded-full px-6 font-bold">
                      <Link href={learner ? `/academy/lms/courses/${course.slug}` : "/academy/login"}>
                        {learner ? "View course" : "Sign in to enrol"}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="rounded-3xl border-dashed bg-white py-0">
              <CardContent className="p-12 text-center">
                <GraduationCap className="mx-auto h-9 w-9 text-ink-faint" />
                <h2 className="mt-4 text-xl">No published courses yet</h2>
                <p className="mt-2 text-sm text-ink-faint">New learning paths will appear here when they are ready for enrolment.</p>
              </CardContent>
            </Card>
          )}
        </section>
      </main>
    </>
  );
}

function Filter({ label, active }: { label: string; active?: boolean }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold ${active ? "bg-navy-950 text-white" : "border border-black/10 bg-white text-ink-soft"}`}>
      {label}
    </span>
  );
}

function Tag({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-paper-deep px-3 py-1.5 text-xs text-ink-soft">
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}
