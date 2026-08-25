"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/inspection", label: "Inspection Services" },
  { href: "/analytics", label: "Analytics" },
  { href: "/academy", label: "Academy" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({
  logo = "/logo-inspection.png",
  logoAlt = "JDL Core logo",
  cta = { href: "/inspection#quote", label: "Get Started" },
}: {
  logo?: string;
  logoAlt?: string;
  cta?: { href: string; label: string };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const close = () => setOpen(false);

  return (
    <>
      <header
        className="sticky top-0 z-100 border-b backdrop-blur-md"
        style={{
          background: "rgba(248, 247, 243, 0.9)",
          borderColor: "var(--border)",
        }}
      >
        <div className="wrap flex items-center gap-6 h-[68px]">
          <Link
            href="/"
            aria-label="JDL Core home"
            className="self-start rounded-b-xl px-3 pb-2 backdrop-blur-md"
            style={{ background: "rgba(248, 247, 243, 0.9)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={logoAlt} className="h-[78px] w-auto" />
          </Link>

          <nav
            aria-label="Primary"
            data-open={open}
            className={[
              "fixed top-[69px] right-0 z-120 flex h-[calc(100dvh-69px)] w-[min(300px,82vw)] flex-col overflow-y-auto border-l px-6 pt-3 pb-6 shadow-[var(--shadow-md-soft)] bg-paper",
              "transition-transform duration-300 [transition-timing-function:var(--ease-jdl)]",
              "max-lg:pointer-events-none max-lg:translate-x-full max-lg:data-[open=true]:pointer-events-auto max-lg:data-[open=true]:translate-x-0",
              "lg:static lg:h-auto lg:w-auto lg:flex-row lg:items-center lg:gap-[26px] lg:ml-auto",
              "lg:border-l-0 lg:p-0 lg:shadow-none lg:bg-transparent lg:overflow-visible lg:pointer-events-auto lg:translate-x-0",
            ].join(" ")}
          >
            {NAV_LINKS.map((link) => {
              const active =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={close}
                  className={`text-[0.93rem] font-medium py-[0.9em] border-b-2 transition-colors [transition-timing-function:var(--ease-jdl)] lg:py-[0.3em] ${
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
          </nav>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="site-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="ml-auto flex h-10 w-10 shrink-0 flex-col justify-center gap-[5px] lg:hidden"
          >
            <span
              className={`block h-0.5 w-[22px] bg-navy-950 transition-transform duration-250 [transition-timing-function:var(--ease-jdl)] ${open ? "translate-y-[7px] rotate-45" : ""}`}
            />
            <span
              className={`block h-0.5 w-[22px] bg-navy-950 transition-opacity duration-200 ${open ? "opacity-0" : ""}`}
            />
            <span
              className={`block h-0.5 w-[22px] bg-navy-950 transition-transform duration-250 [transition-timing-function:var(--ease-jdl)] ${open ? "-translate-y-[7px] -rotate-45" : ""}`}
            />
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
