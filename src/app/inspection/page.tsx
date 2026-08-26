import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ChatWidget } from "@/components/chat-widget";
import { Reveal } from "@/components/reveal";
import { CoqMockup, PortalMockup } from "@/components/mockups";
import { QuoteForm } from "@/components/forms/quote-form";
import { getContactSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "JDL Core Inspection Services | Independent Oil & Gas Inspection",
  description:
    "Independent stock monitoring, collateral verification, tank & depot inspections, and quantity assurance across the oil & gas and commodity value chains.",
};

const SERVICES: { title: string; body: string }[] = [
  {
    title: "Stock Monitoring",
    body: "Ongoing tracking of inventory levels against expected movement, flagging deviations early.",
  },
  {
    title: "Collateral Verification",
    body: "Independent confirmation of pledged stock quantity and condition for lenders and financiers.",
  },
  {
    title: "Tank & Depot Inspections",
    body: "On-site inspection of tanks and depot facilities, covering condition, calibration, and safety.",
  },
  {
    title: "Quantity Verification",
    body: "Precise measurement (GOV, GSV, metric tonnes) to confirm quantities match what's claimed.",
  },
  {
    title: "Reconciliation & Exception Reporting",
    body: "Comparing expected vs. actual stock and reporting exceptions with supporting evidence.",
  },
  {
    title: "Loading & Discharge Supervision",
    body: "On-site oversight during loading and discharge to confirm quantities transferred are accurate.",
  },
  {
    title: "Inventory Audit Support",
    body: "Structured audit assistance for periodic or ad-hoc inventory reviews.",
  },
  {
    title: "Loss & Discrepancy Investigation",
    body: "Root-cause investigation when reported and physical stock don't match.",
  },
  {
    title: "Documentation & Reporting",
    body: "Clear, standardized reports — including Certificates of Quantity — built to hold up under scrutiny.",
  },
  {
    title: "Stock Control Advisory",
    body: "Practical recommendations for tightening stock control processes based on what we find in the field.",
  },
];

const PROCESS = [
  { num: 1, title: "Request", body: "Client submits an inspection request with job details and site information." },
  { num: 2, title: "Assignment", body: "Operations reviews the request and assigns a qualified inspector." },
  { num: 3, title: "Inspection", body: "The inspector performs the on-site work and captures field data and documentation." },
  { num: 4, title: "Verification", body: "Findings are checked and reconciled against expected figures before write-up." },
  { num: 5, title: "Review", body: "Operations reviews the report for accuracy and completeness before it's finalized." },
  { num: 6, title: "Report", body: "Client receives the signed report — including a Certificate of Quantity where applicable.", final: true },
];

function ValueIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-flex h-13 w-13 items-center justify-center rounded-[var(--radius-sm)] bg-navy-100 text-navy-800">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
        {children}
      </svg>
    </div>
  );
}

export default async function InspectionPage() {
  const settings = await getContactSettings();
  return (
    <>
      <SiteHeader
        homeHref="/inspection"
        navLinks={[
          { href: "/inspection", label: "Home" },
          { href: "/inspection#services", label: "Services" },
          { href: "/inspection#about", label: "About" },
          { href: "/inspection#quote", label: "Contact" },
        ]}
        cta={{ href: "#quote", label: "Request an Inspection" }}
      />

      <main>
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden pt-24 pb-18">
          <div className="hero-glow" />
          <div className="wrap relative grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <Reveal className="max-w-[720px]">
              <p className="eyebrow">Independent Inspection &amp; Verification</p>
              <h1 className="text-[clamp(2.2rem,4.4vw,3.4rem)] font-bold">
                Stock You Can <span className="text-gold-600">Verify</span>, Not Just Trust
              </h1>
              <p className="mt-4 max-w-[560px] text-[1.1rem] text-ink-soft">
                JDL Core Inspection Services provides independent stock
                monitoring, collateral verification, tank &amp; depot
                inspections, and quantity assurance across the oil &amp; gas
                and commodity value chains — with no stake in either side of
                the transaction.
              </p>
              <div className="mt-7 mb-2 flex flex-wrap gap-3.5">
                <Link href="#quote" className="btn-gold btn-gold-lg">
                  Request an Inspection
                </Link>
                <Link href="#services" className="btn-ghost px-8 py-4 text-base">
                  View Services
                </Link>
              </div>
            </Reveal>

            <Reveal className="max-lg:max-w-[520px] max-lg:mx-auto w-full">
              <CoqMockup />
            </Reveal>
          </div>
        </section>

        {/* ============ VALUE STRIP ============ */}
        <section className="pt-2 pb-14">
          <div className="wrap grid grid-cols-1 gap-6 md:grid-cols-3">
            <Reveal>
              <ValueIcon>
                <path d="M12 3 4 6v6c0 4.4 3.2 8 8 9 4.8-1 8-4.6 8-9V6l-8-3Z" />
                <path d="m9 12 2 2 4-4" />
              </ValueIcon>
              <h3 className="text-[1.05rem] font-bold">Independent &amp; Unbiased</h3>
              <p className="m-0 text-[0.93rem] text-ink-soft">
                No commercial interest in either side of a transaction — the
                report reflects what we found, not what&apos;s convenient.
              </p>
            </Reveal>
            <Reveal>
              <ValueIcon>
                <rect x="5" y="3" width="14" height="18" rx="2" />
                <path d="M9 3v2h6V3M9 11h6M9 15h4" />
              </ValueIcon>
              <h3 className="text-[1.05rem] font-bold">Documented Every Step</h3>
              <p className="m-0 text-[0.93rem] text-ink-soft">
                Every reading, reconciliation, and exception is recorded, so
                the final report can be traced back to raw field data.
              </p>
            </Reveal>
            <Reveal>
              <ValueIcon>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3.5 2" />
              </ValueIcon>
              <h3 className="text-[1.05rem] font-bold">Built for Turnaround</h3>
              <p className="m-0 text-[0.93rem] text-ink-soft">
                A structured request-to-report workflow keeps jobs moving
                instead of stalling in someone&apos;s inbox.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ============ ABOUT ============ */}
        <section id="about" className="scroll-mt-20 py-21">
          <div className="wrap grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <Reveal>
              <p className="eyebrow">About This Division</p>
              <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                Integrity at the Core of Every Reading
              </h2>
              <p className="mt-4">
                Stock discrepancies are expensive and hard to catch after the
                fact. JDL Core exists to catch them before they become
                someone&apos;s loss — verifying quantities, monitoring
                collateral, and supervising loading and discharge so operators,
                lenders, and traders can make decisions on numbers that
                actually hold up.
              </p>
              <ul className="checklist mt-4 list-none p-0">
                <li>Ten inspection and verification services across the value chain</li>
                <li>A consistent six-step process from request to signed report</li>
                <li>A client portal in development for tracking requests, reports, and invoices</li>
              </ul>
              <Link href="#process" className="link-arrow mt-2 inline-block">
                See how our process works →
              </Link>
            </Reveal>

            <Reveal className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="rounded-[var(--radius)] border bg-white p-5.5 shadow-[var(--shadow-sm-soft)]" style={{ borderColor: "var(--border)" }}>
                <h4 className="font-display font-bold">Who We Serve</h4>
                <p className="m-0 text-[0.92rem] text-ink-soft">
                  Operators, traders, lenders, and depot owners who need an
                  independent third party to verify stock and collateral.
                </p>
              </div>
              <div className="rounded-[var(--radius)] border bg-white p-5.5 shadow-[var(--shadow-sm-soft)]" style={{ borderColor: "var(--border)" }}>
                <h4 className="font-display font-bold">Where We Work</h4>
                <p className="m-0 text-[0.92rem] text-ink-soft">
                  Tank farms, depots, and loading/discharge points across the
                  oil &amp; gas and commodity value chains.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ SERVICES ============ */}
        <section id="services" className="scroll-mt-20 bg-paper-deep py-21">
          <div className="wrap">
            <Reveal className="mb-11">
              <p className="eyebrow">Our Services</p>
              <h2 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                Ten Ways We Keep Stock Numbers Honest
              </h2>
              <p className="max-w-[640px] text-ink-soft">
                From a single tank reading to a full inventory audit, each
                service follows the same documented, independent process.
              </p>
            </Reveal>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {SERVICES.map((s) => (
                <Reveal key={s.title}>
                  <div
                    className="h-full rounded-[var(--radius)] border bg-white p-6 shadow-[var(--shadow-sm-soft)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <h3 className="text-[1.05rem] font-bold">{s.title}</h3>
                    <p className="m-0 text-[0.93rem] text-ink-soft">{s.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ============ PROCESS ============ */}
        <section id="process" className="scroll-mt-20 py-21">
          <div className="wrap">
            <Reveal className="mb-11">
              <p className="eyebrow">How It Works</p>
              <h2 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">Request to Report, in Six Steps</h2>
              <p className="max-w-[640px] text-ink-soft">
                The same structured process for every job, so a report means
                the same thing every time.
              </p>
            </Reveal>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {PROCESS.map((step) => (
                <Reveal key={step.num}>
                  <div
                    className={`relative rounded-[var(--radius)] border bg-white p-6.5 ${step.final ? "border-gold-500" : ""}`}
                    style={step.final ? undefined : { borderColor: "var(--border)" }}
                  >
                    <div className="mb-2.5 font-display text-[1.6rem] font-bold text-gold-600">
                      {step.num}
                    </div>
                    {step.final && (
                      <span className="absolute top-6 right-6 rounded-full bg-navy-100 px-[0.8em] py-[0.3em] text-[0.72rem] font-bold tracking-[0.06em] uppercase text-navy-800">
                        Final Step
                      </span>
                    )}
                    <h3 className="text-lg font-bold">{step.title}</h3>
                    <p className="m-0 text-[0.93rem] text-ink-soft">{step.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ============ PORTAL TEASER ============ */}
        <section className="section-dark py-21">
          <div className="wrap grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <p className="eyebrow !text-gold-300">Client Portal</p>
              <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                A Client Portal, Built for This Workflow
              </h2>
              <p className="mt-4 max-w-[640px] text-[rgba(248,247,243,0.78)]">
                No more chasing status updates by phone or email: track your
                inspection jobs in real time, download reports and Certificates
                of Quantity, and manage invoices — all from one dashboard.
              </p>
              <Link href="/portal/login" className="link-arrow link-arrow-light mt-2 inline-block">
                Sign in to the client portal →
              </Link>
            </Reveal>

            <Reveal className="max-lg:max-w-[520px] max-lg:mx-auto w-full">
              <PortalMockup />
            </Reveal>
          </div>
        </section>

        {/* ============ QUOTE FORM ============ */}
        <section id="quote" className="scroll-mt-20 py-21">
          <div className="wrap">
            <Reveal className="mb-11">
              <p className="eyebrow">Get Started</p>
              <h2 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">Request an Inspection</h2>
              <p className="max-w-[640px] text-ink-soft">
                Tell us about the job and we&apos;ll follow up to confirm
                scope, timing, and pricing.
              </p>
            </Reveal>
            <Reveal>
              <QuoteForm />
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter
        settings={settings}
        brandLine="Independent stock monitoring, collateral verification, and quantity assurance across the oil & gas value chain."
        copyrightName="JDL Core Inspection Services"
        homeHref="/inspection"
        divisionLinks={[
          { href: "/inspection", label: "Home" },
          { href: "/inspection#services", label: "Services" },
          { href: "/inspection#about", label: "About Us" },
          { href: "/inspection#quote", label: "Contact" },
        ]}
        thisDivision={[
          { href: "/inspection#process", label: "Our Process" },
          { href: "/inspection#quote", label: "Request an Inspection" },
        ]}
      />

      <ChatWidget phoneHref={settings.phoneHref} />
    </>
  );
}
