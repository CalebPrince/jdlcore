import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ChatWidget } from "@/components/chat-widget";
import { Reveal } from "@/components/reveal";
import { ContactForm } from "@/components/forms/contact-form";
import { WhatsAppIcon } from "@/components/whatsapp-icon";
import {
  getContactSettings,
  whatsappLink,
} from "@/lib/settings";

export const metadata: Metadata = {
  title: "Contact JDL Core | Get in Touch",
  description:
    "Contact the JDL Core team — send a message, call, email, or reach us directly on WhatsApp.",
};

function DetailIcon({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-navy-100 text-navy-800">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-[19px] w-[19px]">
        {children}
      </svg>
    </div>
  );
}

export default async function ContactPage() {
  const settings = await getContactSettings();
  const wa = whatsappLink(settings);
  return (
    <>
      <SiteHeader
        navLinks={[
          { href: "/", label: "JDL Core Home" },
          { href: "/inspection", label: "Inspection Services" },
          { href: "/analytics", label: "Analytics" },
          { href: "/academy", label: "Academy" },
          { href: "/contact", label: "Contact" },
        ]}
        cta={{ href: "#form", label: "Send a Message" }}
      />

      <main>
        {/* ============ HERO ============ */}
        <section className="relative overflow-hidden pt-24 pb-18">
          <div className="hero-glow" />
          <div className="wrap relative max-w-[720px]">
            <Reveal>
              <p className="eyebrow">Get in Touch</p>
              <h1 className="text-[clamp(2.2rem,4.4vw,3.4rem)] font-bold">
                Talk to the <span className="text-gold-600">JDL Core</span> Team
              </h1>
              <p className="mt-4 max-w-[560px] text-[1.1rem] text-ink-soft">
                Whether it&apos;s a question about a service, a request in
                progress, or something for one of the divisions still in
                development — reach us however&apos;s easiest for you.
              </p>
              <div className="mt-7 mb-2 flex flex-wrap gap-3.5">
                <a
                  className="inline-flex items-center gap-2.5 rounded-full bg-[#25d366] px-7 py-4 text-base font-semibold text-white shadow-[0_10px_26px_rgba(37,211,102,0.35)] transition-all duration-200 [transition-timing-function:var(--ease-jdl)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(37,211,102,0.45)]"
                  href={wa}
                  target="_blank"
                  rel="noopener"
                >
                  <WhatsAppIcon className="h-5 w-5 shrink-0" />
                  Message Us on WhatsApp
                </a>
                <a href="#form" className="btn-ghost px-8 py-4 text-base">
                  Send a Message
                </a>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ============ CONTACT FORM + DETAILS ============ */}
        <section id="form" className="scroll-mt-20 pb-21">
          <div className="wrap grid items-start gap-12 lg:grid-cols-2">
            <Reveal>
              <div
                className="rounded-[var(--radius)] border bg-white p-8 shadow-[var(--shadow-sm-soft)]"
                style={{ borderColor: "var(--border)" }}
              >
                <h2 className="text-[1.3rem] font-bold">Send Us a Message</h2>
                <p className="mb-6 text-ink-soft">
                  Fill this out and we&apos;ll get back to you — or use
                  WhatsApp for a faster reply.
                </p>
                <ContactForm />
              </div>
            </Reveal>

            <Reveal>
              <div
                className="flex flex-col gap-5.5 rounded-[var(--radius)] border bg-white p-7 shadow-[var(--shadow-sm-soft)]"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-start gap-3.5">
                  <DetailIcon>
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z" />
                  </DetailIcon>
                  <div>
                    <h4 className="m-0 mb-0.5 text-[0.9rem] font-bold">Phone</h4>
                    <a href={settings.phoneHref} className="m-0 text-[0.92rem] text-ink-soft hover:text-navy-950">
                      {settings.phoneDisplay}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <DetailIcon>
                    <path d="M4 5h16v11H8l-4 4V5Z" />
                    <path d="M8 9h8M8 12h5" />
                  </DetailIcon>
                  <div>
                    <h4 className="m-0 mb-0.5 text-[0.9rem] font-bold">Email</h4>
                    <a href={`mailto:${settings.emailInfo}`} className="m-0 text-[0.92rem] text-ink-soft hover:text-navy-950">
                      {settings.emailInfo}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <DetailIcon>
                    <path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z" />
                    <circle cx="12" cy="9.5" r="2.5" />
                  </DetailIcon>
                  <div>
                    <h4 className="m-0 mb-0.5 text-[0.9rem] font-bold">Address</h4>
                    <p className="m-0 text-[0.92rem] text-ink-soft">{settings.address}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ background: "rgba(37,211,102,0.15)", color: "#1e9e56" }}
                  >
                    <WhatsAppIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="m-0 mb-0.5 text-[0.9rem] font-bold">WhatsApp</h4>
                    <a href={wa} target="_blank" rel="noopener" className="m-0 text-[0.92rem] text-ink-soft hover:text-navy-950">
                      {settings.whatsappDisplay}
                    </a>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter
        settings={settings}
        brandLine="Independent inspection, industry data analytics, and oil & gas education — one standard of integrity, three divisions."
        columnLabel="Divisions"
        divisionLinks={[
          { href: "/inspection", label: "Inspection Services" },
          { href: "/analytics", label: "Analytics" },
          { href: "/academy", label: "Academy" },
        ]}
        thisDivision={[
          { href: "#form", label: "Send a Message" },
          { href: wa, label: "Message on WhatsApp" },
        ]}
      />

      <ChatWidget phoneHref={settings.phoneHref} />
    </>
  );
}
