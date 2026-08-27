import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import type { ContactSettings } from "@/lib/settings";

export type LegalSection = {
  title: string;
  content: React.ReactNode;
};

export function LegalPage({
  title,
  description,
  updated,
  sections,
  settings,
}: {
  title: string;
  description: string;
  updated: string;
  sections: LegalSection[];
  settings: ContactSettings;
}) {
  return (
    <>
      <SiteHeader
        homeHref="/"
        navLinks={[
          { href: "/inspection", label: "Inspection" },
          { href: "/analytics", label: "Analytics" },
          { href: "/academy", label: "Academy" },
          { href: "/contact", label: "Contact" },
        ]}
        cta={{ href: "/contact", label: "Contact Us" }}
      />
      <main className="legal-page marketing-main min-h-screen">
        <section className="marketing-hero border-b border-navy-900/8 py-18 sm:py-24">
          <div className="wrap relative">
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-navy-950">
              <ArrowLeft aria-hidden="true" className="size-4" /> Back to JDL Core
            </Link>
            <p className="eyebrow">Legal</p>
            <h1 className="mb-0 max-w-3xl text-[clamp(2.8rem,7vw,5.4rem)] font-semibold leading-[1]">{title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-soft">{description}</p>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[.12em] text-ink-faint">Last updated {updated}</p>
          </div>
        </section>
        <div className="wrap grid gap-10 py-14 lg:grid-cols-[220px_minmax(0,760px)] lg:justify-center lg:py-20">
          <aside className="h-fit lg:sticky lg:top-28">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-ink-faint">On this page</p>
            <nav className="mt-4 flex flex-col gap-1" aria-label="Policy sections">
              {sections.map((section, index) => (
                <a key={section.title} href={`#section-${index + 1}`} className="rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-navy-100 hover:text-navy-950">{section.title}</a>
              ))}
            </nav>
          </aside>
          <article className="legal-content rounded-3xl border border-navy-900/8 bg-white p-6 shadow-[0_18px_50px_rgba(8,24,38,.05)] sm:p-10">
            <div className="rounded-2xl border border-gold-500/25 bg-gold-500/8 p-4 text-sm leading-6 text-ink-soft">
              These website policies provide general information about JDL Core&apos;s current practices. They should be reviewed by qualified Ghanaian counsel before being relied on as legal advice.
            </div>
            {sections.map((section, index) => (
              <section key={section.title} id={`section-${index + 1}`} className="scroll-mt-28 border-b border-navy-900/8 py-8 first:pt-9 last:border-0 last:pb-0">
                <h2 className="text-xl font-semibold">{index + 1}. {section.title}</h2>
                <div className="mt-4 space-y-4 text-[0.95rem] leading-7 text-ink-soft">{section.content}</div>
              </section>
            ))}
          </article>
        </div>
      </main>
      <SiteFooter
        settings={settings}
        brandLine="Independent inspection, industry data analytics, and oil & gas education — one standard of integrity."
        columnLabel="Divisions"
        divisionLinks={[
          { href: "/inspection", label: "Inspection Services" },
          { href: "/analytics", label: "Analytics" },
          { href: "/academy", label: "Academy" },
        ]}
        thisDivision={[
          { href: "/privacy", label: "Privacy Policy" },
          { href: "/terms", label: "Terms of Use" },
          { href: "/cookies", label: "Cookie Policy" },
        ]}
      />
    </>
  );
}
