import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight, ExternalLink, Mail } from "lucide-react";
import { getContactSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "JDL Core | Integrity at the Core",
  description: "JDL Core is a group of three oil & gas focused businesses: independent inspection services, an industry-data analytics platform, and an education academy.",
};

const companies = [
  { href: "https://inspect.jdlcore.com", name: "Inspection Services", tag: "Flagship", logo: "/logo-inspection.png", logoAlt: "JDL Core Inspection Services logo", blurb: "Independent tank gauging, stock monitoring & quantity verification." },
  { href: "https://analytics.jdlcore.com", name: "Analytics", tag: "Live Beta", logo: "/logo-analytics.png", logoAlt: "JDL Core Analytics logo", blurb: "Industry-data intelligence, on demand — not a static report." },
  { href: "https://academy.jdlcore.com", name: "Academy", tag: "Now Enrolling", logo: null, logoAlt: undefined, blurb: "Oil & gas training, built by the people who do the inspections." },
] as const;

export default async function HomePage() {
  const settings = await getContactSettings();

  return (
    <main className="group-home relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-16 text-center sm:px-8 sm:py-20">
      <div className="group-home-grid" aria-hidden="true" />
      <div className="group-home-orb group-home-orb-left" aria-hidden="true" />
      <div className="group-home-orb group-home-orb-right" aria-hidden="true" />

      <div className="wrap relative z-10 flex flex-col items-center">
        <div className="group-home-mark" aria-hidden="true"><span /><span /><span /></div>
        <p className="eyebrow mt-6">The JDL Core Group</p>
        <h1 className="group-home-title">JDL Core</h1>
        <p className="group-home-tagline">Integrity at the Core</p>
        <p className="group-home-intro">Independent inspection, industry data analytics, and oil &amp; gas education — three divisions, one standard of integrity.</p>

        <div className="group-home-hint">
          <ExternalLink aria-hidden="true" size={14} strokeWidth={1.8} />
          Click a company below to open its site in a new tab
        </div>

        <div className="group-home-cards">
          {companies.map((company, index) => (
            <a key={company.href} href={company.href} target="_blank" rel="noreferrer" title={company.name} className="group-home-card group">
              <div className="flex w-full items-center justify-between">
                <span className="group-home-badge">{company.tag}</span>
                <span className="group-home-index">0{index + 1}</span>
              </div>
              <div className="group-home-logo">
                {company.logo ? (
                  <Image src={company.logo} alt={company.logoAlt} width={260} height={90} className="max-h-full w-auto max-w-full object-contain" />
                ) : (
                  <span className="font-display text-xl font-bold tracking-[-0.03em] text-navy-950">JDL Core <span className="text-gold-600">Academy</span></span>
                )}
              </div>
              <div className="mt-auto w-full text-left">
                <h2 className="m-0 text-xl font-semibold tracking-[-0.025em]">{company.name}</h2>
                <p className="mt-2 min-h-[3.25rem] text-[0.9rem] leading-[1.65] text-ink-soft">{company.blurb}</p>
                <span className="group-home-link">Visit site <ArrowUpRight aria-hidden="true" size={17} strokeWidth={1.8} /></span>
              </div>
            </a>
          ))}
        </div>

        <div className="group-home-footer">
          <p className="text-[0.9rem] text-ink-soft">Not sure where to start?{" "}<a href={`mailto:${settings.emailInfo}`} className="group-home-email"><Mail aria-hidden="true" size={15} strokeWidth={1.8} />Email us</a>{" "}and we&apos;ll point you the right way.</p>
          <p className="mt-5 text-[0.72rem] tracking-[0.02em] text-ink-faint">© {new Date().getFullYear()} JDL Core. All rights reserved. ·{" "}<a href="/admin/login" className="transition-colors hover:text-gold-600">Staff Login</a></p>
        </div>
      </div>
    </main>
  );
}
