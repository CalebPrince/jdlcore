import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ChatWidget } from "@/components/chat-widget";
import { Reveal } from "@/components/reveal";
import { AnalyticsChatMockup } from "@/components/mockups";
import { WaitlistForm } from "@/components/forms/waitlist-form";
import { submitWaitlist } from "@/app/actions/submissions";
import { getContactSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "JDL Core Analytics | Data. Insight. Performance.",
  description:
    "Source-grounded oil and gas industry intelligence with cited answers, searchable conversations, and exportable reports.",
};

const submitAnalyticsAccessRequest = submitWaitlist.bind(null, "analytics");

function StepIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-flex h-13 w-13 items-center justify-center rounded-[var(--radius-sm)] bg-navy-100 text-navy-800">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
        {children}
      </svg>
    </div>
  );
}

export default async function AnalyticsPage() {
  const settings = await getContactSettings();
  return (
    <>
      <SiteHeader
        logo="/logo-analytics.png"
        logoAlt="JDL Core Analytics logo"
        homeHref="/analytics"
        navLinks={[
          { href: "/analytics", label: "Home" },
          { href: "/analytics#pricing", label: "Pricing" },
          { href: "/analytics#access", label: "Get Access" },
        ]}
        cta={{ href: "/analytics/login", label: "Subscriber Sign In" }}
      />

      <main>
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden pt-24 pb-18">
          <div className="hero-glow" />
          <div className="wrap relative grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <Reveal className="max-w-[720px]">
              <span className="badge-soon mb-4 inline-block rounded-full bg-[rgba(246,207,110,0.2)] px-[0.8em] py-[0.3em] text-[0.72rem] font-bold tracking-[0.06em] uppercase text-gold-600">
                Live Beta
              </span>
              <p className="eyebrow">JDL Core Analytics</p>
              <h1 className="text-[clamp(2.2rem,4.4vw,3.4rem)] font-bold">
                Ask Your <span className="text-gold-600">Industry Data</span> a Question
              </h1>
              <p className="mt-4 max-w-[560px] text-[1.1rem] text-ink-soft">
                A subscription platform where you chat directly with an
                assistant fed on JDL Core&apos;s own inspection and market data
                — insight on demand, instead of waiting on a static report.
              </p>
              <div className="mt-7 mb-2 flex flex-wrap items-center gap-3.5">
                <Link href="/analytics/login" className="btn-gold btn-gold-lg">
                  Open Analytics
                </Link>
                <Link href="/inspection" className="btn-ghost px-8 py-4 text-base">
                  Explore Inspection Services
                </Link>
              </div>
              <p className="m-0 mt-1 text-xs text-muted-foreground">Access is currently approved in small subscriber cohorts.</p>
            </Reveal>

            <Reveal className="max-lg:max-w-[520px] max-lg:mx-auto w-full">
              <AnalyticsChatMockup />
            </Reveal>
          </div>
        </section>

        {/* ============ VALUE STRIP ============ */}
        <section className="pt-2 pb-14">
          <div className="wrap grid grid-cols-1 gap-6 md:grid-cols-3">
            <Reveal>
              <StepIcon>
                <path d="M4 5h16v11H8l-4 4V5Z" />
                <path d="M8 9h8M8 12h5" />
              </StepIcon>
              <h3 className="text-[1.05rem] font-bold">Ask in Plain Language</h3>
              <p className="m-0 text-[0.93rem] text-ink-soft">
                No dashboards to learn — ask a question about stock, trends, or
                a past inspection and get a direct answer.
              </p>
            </Reveal>
            <Reveal>
              <StepIcon>
                <rect x="3" y="10" width="4" height="10" rx="1" />
                <rect x="10" y="5" width="4" height="15" rx="1" />
                <rect x="17" y="13" width="4" height="7" rx="1" />
              </StepIcon>
              <h3 className="text-[1.05rem] font-bold">Grounded in Real Data</h3>
              <p className="m-0 text-[0.93rem] text-ink-soft">
                Fed on JDL Core&apos;s own inspection and industry data, not
                generic public sources.
              </p>
            </Reveal>
            <Reveal>
              <StepIcon>
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M9 12h6M12 9v6" />
              </StepIcon>
              <h3 className="text-[1.05rem] font-bold">Subscription Access</h3>
              <p className="m-0 text-[0.93rem] text-ink-soft">
                A recurring subscription keeps the assistant available whenever
                you need it, not a one-off purchase.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section className="bg-paper-deep py-21">
          <div className="wrap">
            <Reveal className="mb-11">
              <p className="eyebrow">How It Works</p>
              <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold">Get Access, Ask, Verify</h2>
            </Reveal>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <Reveal>
                <div className="rounded-[var(--radius)] border bg-white p-6.5" style={{ borderColor: "var(--border)" }}>
                  <div className="mb-2.5 font-display text-[1.6rem] font-bold text-gold-600">1</div>
                  <h3 className="text-lg font-bold">Get Access</h3>
                  <p className="m-0 text-[0.93rem] text-ink-soft">
                    Request subscriber access and activate your secure account from the invitation link.
                  </p>
                </div>
              </Reveal>
              <Reveal>
                <div className="rounded-[var(--radius)] border bg-white p-6.5" style={{ borderColor: "var(--border)" }}>
                  <div className="mb-2.5 font-display text-[1.6rem] font-bold text-gold-600">2</div>
                  <h3 className="text-lg font-bold">Ask</h3>
                  <p className="m-0 text-[0.93rem] text-ink-soft">
                    Chat with the assistant about stock levels, trends, or past
                    inspection data.
                  </p>
                </div>
              </Reveal>
              <Reveal>
                <div className="rounded-[var(--radius)] border border-gold-500 bg-white p-6.5">
                  <div className="mb-2.5 font-display text-[1.6rem] font-bold text-gold-600">3</div>
                  <h3 className="text-lg font-bold">Get Answers</h3>
                  <p className="m-0 text-[0.93rem] text-ink-soft">
                    Receive a direct answer grounded in JDL Core&apos;s own
                    industry data.
                  </p>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ============ WHAT YOU'LL BE ABLE TO ASK ============ */}
        <section className="py-21">
          <div className="wrap">
            <Reveal className="mb-11">
              <p className="eyebrow">What You&apos;ll Be Able to Ask</p>
              <h2 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                Questions That Normally Take Days of Digging
              </h2>
              <p className="max-w-[640px] text-ink-soft">
                The assistant is being built around the same data our
                inspectors collect in the field — volumes, variances,
                reconciliations, and stock movements. Examples of what a
                subscription will cover:
              </p>
            </Reveal>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <Reveal>
                <div className="flex h-full flex-col rounded-[var(--radius)] border bg-white p-6 shadow-[var(--shadow-sm-soft)]" style={{ borderColor: "var(--border)" }}>
                  <span className="badge-soon mb-3 self-start rounded-full bg-[rgba(246,207,110,0.2)] px-[0.8em] py-[0.3em] text-[0.72rem] font-bold tracking-[0.06em] uppercase text-gold-600">Stock &amp; Volumes</span>
                  <p className="m-0 flex-grow text-[0.95rem] text-ink-soft">
                    &ldquo;What was our closing stock at depot X at the end of
                    last month?&rdquo; — quantities, GOV/GSV figures, and
                    movement summaries pulled straight from verified reports.
                  </p>
                </div>
              </Reveal>
              <Reveal>
                <div className="flex h-full flex-col rounded-[var(--radius)] border bg-white p-6 shadow-[var(--shadow-sm-soft)]" style={{ borderColor: "var(--border)" }}>
                  <span className="badge-soon mb-3 self-start rounded-full bg-[rgba(246,207,110,0.2)] px-[0.8em] py-[0.3em] text-[0.72rem] font-bold tracking-[0.06em] uppercase text-gold-600">Trends &amp; Variances</span>
                  <p className="m-0 flex-grow text-[0.95rem] text-ink-soft">
                    &ldquo;How do my tank variances this quarter compare to
                    last?&rdquo; — spot patterns across inspections before they
                    become losses.
                  </p>
                </div>
              </Reveal>
              <Reveal>
                <div className="flex h-full flex-col rounded-[var(--radius)] border bg-white p-6 shadow-[var(--shadow-sm-soft)]" style={{ borderColor: "var(--border)" }}>
                  <span className="badge-soon mb-3 self-start rounded-full bg-[rgba(246,207,110,0.2)] px-[0.8em] py-[0.3em] text-[0.72rem] font-bold tracking-[0.06em] uppercase text-gold-600">Inspection History</span>
                  <p className="m-0 flex-grow text-[0.95rem] text-ink-soft">
                    &ldquo;When did we last inspect tank Y, and what did we
                    find?&rdquo; — your service history, searchable in plain
                    language.
                  </p>
                </div>
              </Reveal>
            </div>
            <Reveal className="mt-8">
              <p className="m-0 max-w-[720px] text-[0.88rem] text-ink-faint">
                Source-grounded answers, citations, conversation history, usage controls,
                and report exports are live. Connecting a company&apos;s private inspection
                dataset requires managed onboarding.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ============ PRICING ============ */}
        <section id="pricing" className="scroll-mt-20 py-21">
          <div className="wrap">
            <Reveal className="mb-11">
              <p className="eyebrow">Pricing</p>
              <h2 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                Simple Plans, Priced in Cedis
              </h2>
              <p className="max-w-[640px] text-ink-soft">
                Founding-member rates for our first cohort of subscribers —
                locked in for as long as you stay subscribed.
              </p>
            </Reveal>

            <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[1fr_1.08fr_1fr]">
              {/* Depot */}
              <Reveal className="h-full">
                <div className="flex h-full flex-col rounded-[var(--radius)] border bg-white p-7" style={{ borderColor: "var(--border)" }}>
                  <p className="m-0 font-display text-sm font-bold uppercase tracking-[0.08em] text-navy-700">Depot</p>
                  <p className="m-0 mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-[0.95rem] font-bold text-muted-foreground">GHS</span>
                    <span className="font-display text-[2.4rem] leading-none font-bold text-navy-950">1,200</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </p>
                  <p className="m-0 mt-2 text-[0.85rem] text-muted-foreground">For single-site operators who want answers on tap.</p>
                  <ul className="mt-6 mb-8 flex list-none flex-col gap-2.5 p-0 text-[0.9rem] text-ink-soft [&>li]:before:mr-2.5 [&>li]:before:text-gold-600 [&>li]:before:content-['—']">
                    <li>150 questions per month</li>
                    <li>Up to 3 seats</li>
                    <li>Industry &amp; market assistant</li>
                    <li>Email support</li>
                  </ul>
                  <Link href="#access" className="btn-ghost mt-auto w-full py-3 text-center text-sm">
                    Request Depot Access
                  </Link>
                </div>
              </Reveal>

              {/* Business — featured */}
              <Reveal className="h-full">
                <div className="relative flex h-full flex-col rounded-[var(--radius)] bg-navy-950 p-7 pt-9 text-paper shadow-[0_18px_44px_-18px_rgba(8,24,38,0.55)] lg:-my-4 lg:py-11">
                  <span className="absolute top-5 right-5 rounded-full bg-[rgba(246,207,110,0.16)] px-3 py-1 text-[0.66rem] font-bold tracking-[0.07em] uppercase text-gold-400 max-lg:right-7">
                    Most Popular
                  </span>
                  <p className="m-0 font-display text-sm font-bold uppercase tracking-[0.08em] text-gold-400">Trader</p>
                  <p className="m-0 mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-[0.95rem] font-bold text-[#8fa3b0]">GHS</span>
                    <span className="font-display text-[2.4rem] leading-none font-bold">2,800</span>
                    <span className="text-sm text-[#8fa3b0]">/month</span>
                  </p>
                  <p className="m-0 mt-2 text-[0.85rem] text-[#aebcc6]">For trading teams that live on volumes and variances.</p>
                  <ul className="mt-6 mb-8 flex list-none flex-col gap-2.5 p-0 text-[0.9rem] text-paper [&>li]:before:mr-2.5 [&>li]:before:text-gold-400 [&>li]:before:content-['—']">
                    <li>600 questions per month</li>
                    <li>Up to 10 seats</li>
                    <li>Your inspection history, searchable</li>
                    <li>Variance &amp; trend briefings</li>
                    <li>Priority support</li>
                  </ul>
                  <Link href="#access" className="btn-gold mt-auto w-full py-3 text-center text-sm">
                    Request Trader Access
                  </Link>
                </div>
              </Reveal>

              {/* Enterprise */}
              <Reveal className="h-full">
                <div className="flex h-full flex-col rounded-[var(--radius)] border bg-white p-7" style={{ borderColor: "var(--border)" }}>
                  <p className="m-0 font-display text-sm font-bold uppercase tracking-[0.08em] text-navy-700">Enterprise</p>
                  <p className="m-0 mt-3 flex items-baseline gap-1.5">
                    <span className="font-display text-[2.4rem] leading-none font-bold text-navy-950">Custom</span>
                  </p>
                  <p className="m-0 mt-2 text-[0.85rem] text-muted-foreground">For OMCs, lenders and depots with their own data.</p>
                  <ul className="mt-6 mb-8 flex list-none flex-col gap-2.5 p-0 text-[0.9rem] text-ink-soft [&>li]:before:mr-2.5 [&>li]:before:text-gold-600 [&>li]:before:content-['—']">
                    <li>Unlimited questions</li>
                    <li>Unlimited seats</li>
                    <li>Your documents connected to the assistant</li>
                    <li>Dedicated onboarding &amp; SLA</li>
                  </ul>
                  <Link href="#access" className="btn-ghost mt-auto w-full py-3 text-center text-sm">
                    Talk to Us
                  </Link>
                </div>
              </Reveal>
            </div>

            <Reveal className="mt-8">
              <p className="m-0 max-w-[720px] text-[0.82rem] text-ink-faint">
                Prices exclude VAT and applicable levies. Beta access and billing
                are confirmed directly during onboarding. Founding-member pricing
                applies to the first cohort only.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ============ ACCESS ============ */}
        <section id="access" className="scroll-mt-20 bg-paper-deep py-21">
          <div className="wrap">
            <Reveal className="mb-11">
              <p className="eyebrow">Subscriber Access</p>
              <h2 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">Request Beta Access</h2>
              <p className="max-w-[640px] text-ink-soft">
                Tell us where Analytics fits your operation. Approved subscribers
                receive a private activation link and onboarding guidance.
              </p>
            </Reveal>
            <Reveal>
              <WaitlistForm action={submitAnalyticsAccessRequest} />
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter
        settings={settings}
        brandLine="Source-grounded industry intelligence with cited answers and exportable reports."
        copyrightName="JDL Core Analytics"
        logo="/logo-analytics.png"
        logoAlt="JDL Core Analytics logo"
        homeHref="/analytics"
        divisionLinks={[
          { href: "/analytics", label: "Home" },
          { href: "/analytics#pricing", label: "Pricing" },
        ]}
        thisDivision={[{ href: "/analytics/login", label: "Subscriber Sign In" }, { href: "/analytics#access", label: "Request Access" }]}
      />

      <ChatWidget phoneHref={settings.phoneHref} />
    </>
  );
}
