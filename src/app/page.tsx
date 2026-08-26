import type { Metadata } from "next";
import { getContactSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "JDL Core | Integrity at the Core",
  description:
    "JDL Core is a group of three oil & gas focused businesses: independent inspection services, an industry-data analytics platform, and an education academy.",
};

const companies = [
  {
    // inspect.jdlcore.com is the OLD site — stay on the new build here
    // until this app is migrated onto that subdomain, then swap this
    // back to "https://inspect.jdlcore.com".
    href: "/inspection",
    name: "Inspection Services",
    tag: "Flagship",
    logo: "/logo-inspection.png",
    logoAlt: "JDL Core Inspection Services logo",
    blurb: "Independent tank gauging, stock monitoring & quantity verification.",
  },
  {
    // No analytics.jdlcore.com yet — falls back to the internal page.
    href: "/analytics",
    name: "Analytics",
    tag: "Live Beta",
    logo: "/logo-analytics.png",
    logoAlt: "JDL Core Analytics logo",
    blurb: "Industry-data intelligence, on demand — not a static report.",
  },
  {
    // No academy.jdlcore.com yet — falls back to the internal page.
    href: "/academy",
    name: "Academy",
    tag: "Now Enrolling",
    logo: null,
    logoAlt: undefined,
    blurb: "Oil & gas training, built by the people who do the inspections.",
  },
];

export default async function HomePage() {
  const settings = await getContactSettings();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-20 text-center">
      <div className="hero-glow" />

      <div className="wrap relative flex flex-col items-center">
        <p className="eyebrow">The JDL Core Group</p>
        <h1 className="mb-2 text-[clamp(2rem,4vw,2.8rem)] font-bold">JDL Core</h1>
        <p className="mb-3 text-[1.05rem] font-semibold text-gold-600 italic">Integrity at the Core</p>
        <p className="mb-10 max-w-[520px] text-ink-soft">
          Independent inspection, industry data analytics, and oil &amp; gas
          education — three divisions, one standard of integrity.
        </p>

        <div
          className="mb-10 inline-flex items-center gap-2 rounded-full border bg-paper-deep px-4 py-2 text-[0.8rem] text-ink-soft"
          style={{ borderColor: "var(--border)" }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0 text-gold-600"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
          Click a company below to open its site in a new tab
        </div>

        <div className="grid w-full max-w-[980px] grid-cols-1 gap-6 sm:grid-cols-3">
          {companies.map((company) => (
            <a
              key={company.href}
              href={company.href}
              target="_blank"
              rel="noreferrer"
              title={company.name}
              className="group flex flex-col items-center rounded-[var(--radius)] border bg-white p-7 text-center shadow-[var(--shadow-sm-soft)] transition-all duration-250 [transition-timing-function:var(--ease-jdl)] hover:-translate-y-1 hover:shadow-[var(--shadow-md-soft)]"
              style={{ borderColor: "var(--border)" }}
            >
              <span className="mb-4 inline-block rounded-full bg-navy-100 px-[0.8em] py-[0.3em] text-[0.68rem] font-bold tracking-[0.06em] text-navy-800 uppercase">
                {company.tag}
              </span>
              <div className="mb-4 flex h-16 w-full items-center justify-center">
                {company.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={company.logo} alt={company.logoAlt} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="font-display text-lg font-bold text-navy-950">JDL Core Academy</span>
                )}
              </div>
              <h3 className="text-lg font-bold">{company.name}</h3>
              <p className="mt-1 flex-grow text-[0.85rem] text-ink-soft">{company.blurb}</p>
              <span className="link-arrow mt-4 text-[0.85rem]">Visit site →</span>
            </a>
          ))}
        </div>

        <div className="mt-16 w-full max-w-[520px] border-t pt-8" style={{ borderColor: "var(--border)" }}>
          <p className="text-[0.85rem] text-ink-soft">
            Not sure where to start?{" "}
            <a href={`mailto:${settings.emailInfo}`} className="link-arrow">
              Email us
            </a>{" "}
            and we&apos;ll point you the right way.
          </p>
          <p className="mt-4 text-[0.72rem] tracking-[0.02em] text-ink-faint">
            © {new Date().getFullYear()} JDL Core. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  );
}
