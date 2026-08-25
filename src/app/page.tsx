import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ChatWidget } from "@/components/chat-widget";
import { Reveal } from "@/components/reveal";
import { OverviewMockup } from "@/components/mockups";
import { getContactSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "JDL Core | Integrity at the Core",
  description:
    "JDL Core is a group of three oil & gas focused businesses: independent inspection services, an industry-data analytics platform, and an education academy.",
};

export default async function HomePage() {
  const settings = await getContactSettings();
  return (
    <>
      <SiteHeader
        cta={{ href: "/inspection#quote", label: "Get Started" }}
        showAdminLogin
      />

      <main>
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden pt-24 pb-18">
          <div className="hero-glow" />
          <div className="wrap relative grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <Reveal className="max-w-[720px]">
              <p className="eyebrow">The JDL Core Group</p>
              <h1 className="text-[clamp(2.2rem,4.4vw,3.4rem)] font-bold">
                Our Standard: <span className="text-gold-600">Accuracy, Integrity</span> &amp; Industry Expertise
              </h1>
              <p className="mt-4 max-w-[560px] text-[1.1rem] text-ink-soft">
                JDL Core brings independent inspection, industry data
                intelligence, and hands-on training together under one standard:
                accurate numbers, honest reporting, and people who know the oil
                &amp; gas value chain from the ground up.
              </p>
              <div className="mt-7 mb-2 flex flex-wrap gap-3.5">
                <Link href="/inspection" className="btn-gold btn-gold-lg">
                  Explore Inspection Services
                </Link>
                <Link href="#divisions" className="btn-ghost btn-lg px-8 py-4 text-base">
                  See All Divisions
                </Link>
              </div>
            </Reveal>

            <Reveal className="max-lg:max-w-[520px] max-lg:mx-auto w-full">
              <OverviewMockup />
            </Reveal>
          </div>
        </section>

        {/* ============ DIVISIONS ============ */}
        <section id="divisions" className="scroll-mt-20 py-21">
          <div className="wrap">
            <Reveal className="mb-11">
              <p className="eyebrow">Our Divisions</p>
              <h2 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                Three Companies Working the Same Value Chain
              </h2>
              <p className="max-w-[640px] text-ink-soft">
                Each division stands on its own, built around one part of the
                same problem: giving oil &amp; gas operators numbers and
                knowledge they can trust.
              </p>
            </Reveal>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <Reveal className="h-full">
                <DivisionCard
                  logo="/logo-inspection.png"
                  logoAlt="JDL Core Inspection Services logo"
                  tag="Flagship"
                  title="Inspection Services"
                  body="Independent stock monitoring, collateral verification, tank & depot inspections, and quantity assurance across the oil & gas and commodity value chains."
                  link={{ href: "/inspection", label: "Explore Inspection Services →" }}
                />
              </Reveal>
              <Reveal className="h-full">
                <DivisionCard
                  logo="/logo-analytics.png"
                  logoAlt="JDL Core Analytics logo"
                  tag="Live Beta"
                  title="Analytics"
                  body="A subscription platform where clients chat with an industry-data assistant fed on JDL Core's own inspection and market data — insight on demand, not a static report."
                  link={{ href: "/analytics", label: "Explore Analytics →" }}
                />
              </Reveal>
              <Reveal className="h-full">
                <DivisionCard
                  tag="Now Enrolling"
                  title="Academy"
                  body="An oil & gas education center: structured tutorials and practice tests built by the same people who perform the inspections, aimed at industry newcomers and working professionals."
                  link={{ href: "/academy", label: "Explore Academy →" }}
                />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ============ WHY JDL CORE ============ */}
        <section className="bg-paper-deep py-21">
          <div className="wrap grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <Reveal>
              <p className="eyebrow">Why JDL Core</p>
              <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                Built by People Who Work the Value Chain, Not Around It
              </h2>
              <p className="mt-4">
                JDL Core started as an inspection company because operators kept
                running into the same problem: numbers that didn&apos;t add up,
                and nobody independent to check them. The Analytics and Academy
                divisions grew out of the same insight, that good data and real
                training are just as scarce as an honest inspection.
              </p>
              <ul className="checklist mt-4 list-none p-0">
                <li>Independent, third-party verification — no conflict of interest with either side of a transaction</li>
                <li>Field-tested processes, documented at every step</li>
                <li>One standard of integrity applied across all three divisions</li>
              </ul>
              <Link href="/inspection#services" className="link-arrow mt-2 inline-block">
                See how inspections work →
              </Link>
            </Reveal>

            <Reveal className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="rounded-[var(--radius)] border bg-white p-5.5 shadow-[var(--shadow-sm-soft)]" style={{ borderColor: "var(--border)" }}>
                <h4 className="font-display font-bold">Inspection Services</h4>
                <p className="m-0 text-[0.92rem] text-ink-soft">
                  Live and taking requests. Ten inspection and verification
                  services across the oil &amp; gas value chain.
                </p>
              </div>
              <div className="rounded-[var(--radius)] border bg-white p-5.5 shadow-[var(--shadow-sm-soft)]" style={{ borderColor: "var(--border)" }}>
                <h4 className="font-display font-bold">Analytics &amp; Academy</h4>
                <p className="m-0 text-[0.92rem] text-ink-soft">
                  Analytics is open to approved beta subscribers, and Academy
                  learners can register, take courses, and earn certificates now.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="section-dark py-21">
          <div className="wrap mx-auto max-w-[680px] text-center">
            <Reveal>
              <p className="eyebrow !text-gold-300">Ready When You Are</p>
              <h2 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">Start With an Inspection Request</h2>
              <p className="max-w-[640px] mx-auto text-[rgba(248,247,243,0.78)]">
                Inspection Services is the division open for business today.
                Reach out and we&apos;ll walk you through how the request and
                reporting process works.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3.5">
                <Link href="/inspection#quote" className="btn-gold btn-gold-lg">
                  Request an Inspection
                </Link>
                <Link href="/inspection#services" className="inline-flex items-center justify-center gap-2 rounded-full border-[1.5px] border-[rgba(246,207,110,0.5)] px-8 py-4 text-base font-semibold whitespace-nowrap text-paper transition-colors hover:bg-[rgba(246,207,110,0.12)] hover:border-gold-300">
                  View Services
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter
        settings={settings}
        brandLine="Independent inspection, industry data analytics, and oil & gas education — one standard of integrity, three divisions."
        divisionLinks={[
          { href: "/inspection", label: "Inspection Services" },
          { href: "/analytics", label: "Analytics" },
          { href: "/academy", label: "Academy" },
        ]}
      />

      <ChatWidget phoneHref={settings.phoneHref} />
    </>
  );
}

function DivisionCard({
  logo,
  logoAlt,
  tag,
  tagSoon,
  title,
  body,
  link,
}: {
  logo?: string;
  logoAlt?: string;
  tag: string;
  tagSoon?: boolean;
  title: string;
  body: string;
  link: { href: string; label: string };
}) {
  return (
    <div
      className="group flex h-full flex-col items-start rounded-[var(--radius)] border bg-white p-8 shadow-[var(--shadow-sm-soft)] transition-all duration-250 [transition-timing-function:var(--ease-jdl)] hover:-translate-y-1 hover:shadow-[var(--shadow-md-soft)]"
      style={{ borderColor: "var(--border)" }}
    >
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={logoAlt} className="mb-4.5 h-14 w-auto self-start" />
      )}
      <span
        className={`mb-3 inline-block rounded-full px-[0.8em] py-[0.3em] text-[0.72rem] font-bold tracking-[0.06em] uppercase ${
          tagSoon ? "badge-soon" : "bg-navy-100 text-navy-800"
        }`}
      >
        {tag}
      </span>
      <h3 className="text-xl font-bold">{title}</h3>
      <p className="flex-grow text-ink-soft">{body}</p>
      <Link href={link.href} className="link-arrow mt-2">
        {link.label}
      </Link>
    </div>
  );
}
