"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, LockKeyhole, Menu, X } from "lucide-react";

export type HeaderNavLink = { href: string; label: string };

export function SiteHeader({
  logo = "/logo-inspection.png",
  logoAlt = "JDL Core logo",
  homeHref = "/",
  navLinks,
  cta = { href: "/inspection#quote", label: "Get Started" },
  secondaryCtas,
  showAdminLogin = false,
}: {
  logo?: string | null;
  logoAlt?: string;
  homeHref?: string;
  navLinks: HeaderNavLink[];
  cta?: { href: string; label: string };
  secondaryCtas?: { href: string; label: string; external?: boolean }[];
  showAdminLogin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const close = () => setOpen(false);

  return (
    <>
      <header className="site-header sticky top-0 z-100 border-b border-navy-900/8 bg-paper/82 backdrop-blur-xl">
        <div className="wrap flex h-[72px] items-center gap-6">
          <Link
            href={homeHref}
            aria-label={logoAlt}
            className="relative z-10 self-start rounded-b-2xl border-x border-b border-navy-900/8 bg-paper/92 px-3 pb-2 shadow-[0_10px_25px_rgba(8,24,38,.06)] backdrop-blur-xl"
          >
            {logo ? (
              <Image src={logo} alt={logoAlt} width={220} height={90} priority className="h-[78px] w-auto object-contain" />
            ) : (
              <span className="font-display text-lg font-bold text-navy-950">{logoAlt}</span>
            )}
          </Link>

          <nav
            aria-label="Primary"
            id="site-nav"
            data-open={open}
            className={[
              "fixed top-[73px] right-0 z-120 flex h-[calc(100dvh-73px)] w-[min(340px,88vw)] flex-col overflow-y-auto border-l border-navy-900/8 bg-paper/96 px-6 pt-4 pb-6 shadow-[var(--shadow-md-soft)] backdrop-blur-xl",
              "transition-transform duration-300 [transition-timing-function:var(--ease-jdl)]",
              "max-lg:pointer-events-none max-lg:translate-x-full max-lg:data-[open=true]:pointer-events-auto max-lg:data-[open=true]:translate-x-0",
              "lg:static lg:h-auto lg:w-auto lg:flex-row lg:items-center lg:gap-[26px] lg:ml-auto",
              "lg:border-l-0 lg:p-0 lg:shadow-none lg:bg-transparent lg:overflow-visible lg:pointer-events-auto lg:translate-x-0",
            ].join(" ")}
          >
            {navLinks.map((link) => {
              // Only exact-path links (no "#section" anchor) can be "active" —
              // there's no scroll-spy to know which in-page section is current.
              const active = !link.href.includes("#") && pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={close}
              className={`rounded-lg border-b-2 px-2 py-[0.9em] text-[0.9rem] font-medium transition-colors [transition-timing-function:var(--ease-jdl)] lg:py-[0.45em] ${
                    active
                      ? "border-gold-600 text-navy-950"
                      : "border-transparent text-ink hover:border-gold-600 hover:text-navy-950"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link href={cta.href} onClick={close} className="btn-gold mt-3 lg:mt-0">
              {cta.label}
            </Link>
            {secondaryCtas?.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noreferrer" : undefined}
                className="mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-navy-800/18 bg-white/55 px-5 py-2.5 text-sm font-semibold text-navy-800 transition-all hover:border-navy-800 hover:bg-navy-800 hover:text-paper lg:mt-0"
              >
                {item.label}
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </Link>
            ))}
            {showAdminLogin && (
              <Link
                href="/admin/login"
                onClick={close}
                aria-label="Admin login"
                title="Admin login"
                className="mt-2 inline-flex h-10 w-10 shrink-0 items-center justify-center self-start rounded-full border border-navy-200 text-navy-800 transition-colors hover:border-gold-600 hover:bg-gold-100 hover:text-navy-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-600 lg:mt-0 lg:self-auto"
              >
                <LockKeyhole aria-hidden="true" className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </Link>
            )}
          </nav>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="site-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="ml-auto inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-navy-900/10 bg-white/60 text-navy-950 transition-colors hover:bg-white lg:hidden"
          >
            {open ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
          </button>
        </div>
      </header>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-90 cursor-default bg-[rgba(8,24,38,0.45)] lg:hidden"
          tabIndex={-1}
        />
      )}
    </>
  );
}
