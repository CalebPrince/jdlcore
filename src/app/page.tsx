import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ExternalLink, Mail } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ChatWidget } from "@/components/chat-widget";
import { Reveal } from "@/components/reveal";
import { OverviewMockup, AnalyticsChatMockup, AcademyMockup } from "@/components/mockups";
import { getContactSettings, whatsappLink } from "@/lib/settings";

export const metadata: Metadata = {
  title: "JDL Core | Independent Oil & Gas Inspection, Analytics & Training",
  description:
    "JDL Core is a West African oil & gas group with three divisions: independent inspection and quantity verification, an on-demand industry-data analytics platform, and a technical training academy — one standard of integrity across all three.",
  keywords: [
    "oil and gas inspection",
    "independent stock monitoring",
    "tank gauging",
    "collateral verification",
    "quantity verification",
    "petroleum inspection Ghana",
    "oil and gas analytics",
    "oil and gas training academy",
    "JDL Core",
  ],
  alternates: { canonical: "https://jdlcore.com" },
  openGraph: {
    type: "website",
    url: "https://jdlcore.com",
    siteName: "JDL Core",
    title: "JDL Core | Independent Oil & Gas Inspection, Analytics & Training",
    description:
      "One oil & gas group, three divisions: independent inspection and quantity verification, on-demand industry-data analytics, and a technical training academy.",
  },
};

const DIVISIONS = [
  {
    href: "https://inspect.jdlcore.com",
    name: "Inspection Services",
    tag: "Flagship Division",
    logo: "/logo-inspection.png",
    logoAlt: "JDL Core Inspection Services",
    blurb:
      "Independent tank gauging, stock monitoring, collateral verification, and quantity assurance across the oil & gas and commodity value chains.",
    points: [
      "Stock monitoring & reconciliation",
      "Collateral verification for lenders",
      "Certificates of Quantity built to hold up under scrutiny",
    ],
    cta: "Visit Inspection Services",
  },
  {
    href: "https://analytics.jdlcore.com",
    name: "Analytics",
    tag: "Live Beta",
    logo: "/logo-analytics.png",
    logoAlt: "JDL Core Analytics",
    blurb:
      "Industry-data intelligence you query on demand — ask a question in plain language and get an answer backed by real inspection data, not a static quarterly report.",
    points: [
      "Ask questions in plain language",
      "Answers grounded in field data",
      "Track variance and trends over time",
    ],
    cta: "Visit Analytics",
  },
  {
    href: "https://academy.jdlcore.com",
    name: "Academy",
    tag: "Now Enrolling",
    logo: null,
    logoAlt: "JDL Core Academy",
    blurb:
      "Oil & gas training built by the people who do the inspections — practical courses in tank gauging, quantity verification, and stock control, with certificates on completion.",
    points: [
      "Courses built by working inspectors",
      "Tank gauging & quantity verification",
      "Verifiable certificates on completion",
    ],
    cta: "Visit Academy",
  },
] as const;

const APPROACH = [
  {
    title: "No stake in the outcome",
    body: "JDL Core has no commercial interest in either side of a transaction. Every reading and every report reflects what our people found in the field — nothing else.",
  },
  {
    title: "Documented end to end",
    body: "Every measurement, reconciliation, and exception is recorded, so a finished report can always be traced back to the raw field data behind it.",
  },
  {
    title: "One standard across divisions",
    body: "The discipline that governs an inspection also governs the data we publish and the courses we teach. Integrity at the core is the operating model, not a tagline.",
  },
];

export default async function HomePage() {
  const settings = await getContactSettings();
  const wa = whatsappLink(settings);

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "JDL Core",
    url: "https://jdlcore.com",
    slogan: "Integrity at the Core",
    description:
      "West African oil & gas group operating three divisions: independent inspection and quantity verification, an on-demand industry-data analytics platform, and a technical training academy.",
    email: settings.emailInfo,
    telephone: settings.phoneDisplay,
    address: { "@type": "PostalAddress", addressLocality: settings.address },
    subOrganization: [
      { "@type": "Organization", name: "JDL Core Inspection Services", url: "https://inspect.jdlcore.com" },
      { "@type": "Organization", name: "JDL Core Analytics", url: "https://analytics.jdlcore.com" },
      { "@type": "Organization", name: "JDL Core Academy", url: "https://academy.jdlcore.com" },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />

      <SiteHeader
        logo={null}
        logoAlt="JDL Core"
        homeHref="/"
        navLinks={[
          { href: "#divisions", label: "Divisions" },
          { href: "#about", label: "About" },
          { href: "#approach", label: "Our Approach" },
          { href: "/contact", label: "Contact" },
        ]}
        cta={{ href: "/contact", label: "Get in Touch" }}
        showAdminLogin
      />

      <main className="marketing-main">
        {/* ============ HERO ============ */}
        <section className="marketing-hero relative overflow-hidden pt-24 pb-18">
          <div className="hero-glow" />
          <div className="wrap relative grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <Reveal className="max-w-[720px]">
              <p className="eyebrow">The JDL Core Group</p>
              <h1 className="text-[clamp(2.2rem,4.6vw,3.5rem)] font-bold">
                Independent Oil &amp; Gas{" "}
                <span className="text-gold-600">Inspection</span>, Analytics &amp;
                Training
              </h1>
              <p className="mt-4 max-w-[560px] text-[1.1rem] text-ink-soft">
                JDL Core is one group with three divisions — a flagship
                inspection practice that verifies stock and quantities, an
                analytics platform that turns that field data into answers, and
                an academy that trains the next set of inspectors. One standard
                of integrity runs through all three.
              </p>
              <div className="mt-7 mb-2 flex flex-wrap gap-3.5">
                <Link href="#divisions" className="btn-gold btn-gold-lg">
                  Explore the Divisions
                </Link>
                <Link href="/contact" className="btn-ghost px-8 py-4 text-base">
                  Talk to the Team
                </Link>
              </div>
              <p className="mt-3 text-[0.85rem] text-ink-faint">
                Serving operators, traders, lenders, and depots across the West
                African oil &amp; gas value chain.
              </p>
            </Reveal>

            <Reveal className="max-lg:max-w-[520px] max-lg:mx-auto w-full">
              <OverviewMockup />
            </Reveal>
          </div>
        </section>

        {/* ============ DIVISIONS (the three cards) ============ */}
        <section id="divisions" className="scroll-mt-20 bg-paper-deep py-21">
          <div className="wrap">
            <Reveal className="mb-11 max-w-[680px]">
              <p className="eyebrow">Three Divisions, One Standard</p>
              <h2 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                Pick the Division You Need
              </h2>
              <p className="text-ink-soft">
                Each division runs as its own business with its own site and
                login. Choose the one that fits — each link opens in a new tab so
                you don&apos;t lose your place here.
              </p>
              <div className="group-home-hint mt-5">
                <ExternalLink aria-hidden="true" size={14} strokeWidth={1.8} />
                Selecting a division opens its site in a new tab
              </div>
            </Reveal>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {DIVISIONS.map((d, i) => (
                <Reveal key={d.href} className="h-full">
                  <a
                    href={d.href}
                    target="_blank"
                    rel="noreferrer"
                    title={d.name}
                    className="group flex h-full flex-col rounded-[var(--radius)] border bg-white p-6"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-navy-100 px-3 py-1 text-[0.64rem] font-bold uppercase tracking-[0.08em] text-navy-800">
                        {d.tag}
                      </span>
                      <span className="font-display text-[0.72rem] font-semibold tracking-[0.08em] text-ink-faint">
                        0{i + 1}
                      </span>
                    </div>

                    <div className="mt-5 flex h-[84px] items-center">
                      {d.logo ? (
                        <Image
                          src={d.logo}
                          alt={d.logoAlt}
                          width={240}
                          height={80}
                          className="max-h-[68px] w-auto max-w-[86%] object-contain"
                        />
                      ) : (
                        <span className="font-display text-xl font-bold tracking-[-0.03em] text-navy-950">
                          JDL Core <span className="text-gold-600">Academy</span>
                        </span>
                      )}
                    </div>

                    <h3 className="mt-2 text-xl font-bold">{d.name}</h3>
                    <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-soft">
                      {d.blurb}
                    </p>

                    <ul className="checklist mt-4 list-none p-0 text-[0.88rem]">
                      {d.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>

                    <span
                      className="mt-auto flex items-center justify-between gap-1.5 border-t pt-4 text-[0.85rem] font-semibold text-navy-800"
                      style={{ borderColor: "var(--border)" }}
                    >
                      {d.cta}
                      <ArrowUpRight
                        aria-hidden="true"
                        size={17}
                        strokeWidth={1.8}
                        className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </span>
                  </a>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ============ ABOUT THE GROUP ============ */}
        <section id="about" className="scroll-mt-20 py-21">
          <div className="wrap grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <Reveal>
              <p className="eyebrow">About the Group</p>
              <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                Built Around One Question: Does the Stock Add Up?
              </h2>
              <p className="mt-4">
                Stock discrepancies in oil &amp; gas are expensive and hard to
                catch after the fact. JDL Core started as an independent
                inspection practice built to catch them in the field — verifying
                quantities, monitoring collateral, and supervising loading and
                discharge so operators, lenders, and traders can decide on
                numbers that actually hold up.
              </p>
              <p className="mt-4">
                The Analytics platform grew out of that inspection work: once you
                have years of verified field data, the natural next step is to
                let people question it directly. The Academy closes the loop —
                training the inspectors and stock controllers the industry keeps
                asking for. Three divisions, one chain of custody for the truth.
              </p>
              <Link href="/contact" className="link-arrow mt-2 inline-block">
                Talk to us about your operation &rarr;
              </Link>
            </Reveal>

            <Reveal className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div
                className="rounded-[var(--radius)] border bg-white p-5.5 shadow-[var(--shadow-sm-soft)]"
                style={{ borderColor: "var(--border)" }}
              >
                <h4 className="font-display font-bold">Who We Serve</h4>
                <p className="m-0 text-[0.92rem] text-ink-soft">
                  Operators, traders, lenders, and depot owners who need an
                  independent third party to verify stock and collateral.
                </p>
              </div>
              <div
                className="rounded-[var(--radius)] border bg-white p-5.5 shadow-[var(--shadow-sm-soft)]"
                style={{ borderColor: "var(--border)" }}
              >
                <h4 className="font-display font-bold">Where We Work</h4>
                <p className="m-0 text-[0.92rem] text-ink-soft">
                  Tank farms, depots, and loading and discharge points across the
                  oil &amp; gas and commodity value chains.
                </p>
              </div>
              <div
                className="rounded-[var(--radius)] border bg-white p-5.5 shadow-[var(--shadow-sm-soft)] sm:col-span-2"
                style={{ borderColor: "var(--border)" }}
              >
                <h4 className="font-display font-bold">The Group</h4>
                <p className="m-0 text-[0.92rem] text-ink-soft">
                  Inspection Services (flagship), Analytics (live beta), and the
                  Academy (now enrolling) — run as separate businesses under a
                  shared standard.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ APPROACH ============ */}
        <section id="approach" className="scroll-mt-20 bg-paper-deep py-21">
          <div className="wrap">
            <Reveal className="mb-11 max-w-[680px]">
              <p className="eyebrow">Our Approach</p>
              <h2 className="mb-4 text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                Why Independence Is the Whole Point
              </h2>
              <p className="text-ink-soft">
                The value of a JDL Core report is that it isn&apos;t ours to
                shade. The same principle carries into the data and the training.
              </p>
            </Reveal>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {APPROACH.map((a) => (
                <Reveal key={a.title}>
                  <div
                    className="h-full rounded-[var(--radius)] border bg-white p-6 shadow-[var(--shadow-sm-soft)]"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <h3 className="text-[1.05rem] font-bold">{a.title}</h3>
                    <p className="m-0 text-[0.93rem] text-ink-soft">{a.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ============ PLATFORMS PREVIEW ============ */}
        <section className="py-21">
          <div className="wrap grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <p className="eyebrow">From the Divisions</p>
              <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                The Same Field Data, Put to Work Two Ways
              </h2>
              <p className="mt-4 max-w-[560px] text-ink-soft">
                Analytics lets you interrogate verified inspection data in plain
                language. The Academy turns the methods behind that data into
                courses. Open either division to see the full picture.
              </p>
              <div className="mt-6 flex flex-wrap gap-3.5">
                <a
                  href="https://analytics.jdlcore.com"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost px-7 py-3.5 text-base"
                >
                  Open Analytics
                  <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.8} />
                </a>
                <a
                  href="https://academy.jdlcore.com"
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost px-7 py-3.5 text-base"
                >
                  Open Academy
                  <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.8} />
                </a>
              </div>
            </Reveal>
            <Reveal className="grid gap-5 sm:grid-cols-2 max-lg:max-w-[560px] max-lg:mx-auto">
              <AnalyticsChatMockup />
              <AcademyMockup />
            </Reveal>
          </div>
        </section>

        {/* ============ CTA BAND ============ */}
        <section className="section-dark py-21">
          <div className="wrap grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <Reveal>
              <p className="eyebrow !text-gold-300">Not Sure Where to Start?</p>
              <h2 className="text-[clamp(1.6rem,3vw,2.2rem)] font-bold">
                Tell Us About the Job — We&apos;ll Point You the Right Way
              </h2>
              <p className="mt-4 max-w-[560px] text-[rgba(248,247,243,0.78)]">
                Whether you need an inspection scheduled, access to the analytics
                beta, or a team trained, one message reaches the whole group.
              </p>
            </Reveal>
            <Reveal className="flex flex-col gap-3">
              <a href={`mailto:${settings.emailInfo}`} className="btn-gold btn-gold-lg">
                <Mail aria-hidden="true" size={17} strokeWidth={1.8} />
                Email {settings.emailInfo}
              </a>
              <a
                href={wa}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-paper transition-colors hover:bg-white/12"
              >
                Message on WhatsApp
              </a>
              <Link
                href="/contact"
                className="link-arrow link-arrow-light self-center"
              >
                Or use the contact form &rarr;
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter
        settings={settings}
        logo={null}
        logoAlt="JDL Core"
        brandLine="Independent inspection, industry-data analytics, and oil & gas education — one standard of integrity, three divisions."
        copyrightName="JDL Core"
        homeHref="/"
        columnLabel="Divisions"
        divisionLinks={[
          { href: "https://inspect.jdlcore.com", label: "Inspection Services" },
          { href: "https://analytics.jdlcore.com", label: "Analytics" },
          { href: "https://academy.jdlcore.com", label: "Academy" },
        ]}
        thisDivision={[
          { href: "#about", label: "About the Group" },
          { href: "#approach", label: "Our Approach" },
          { href: "/contact", label: "Contact" },
          { href: "/admin/login", label: "Staff Login" },
        ]}
      />

      <ChatWidget phoneHref={settings.phoneHref} />
    </>
  );
}
