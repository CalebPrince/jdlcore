import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import type { ContactSettings } from "@/lib/settings";
import { whatsappLink } from "@/lib/settings";
import { WhatsAppIcon } from "./whatsapp-icon";

export type FooterDivisionLink = { href: string; label: string };

export function SiteFooter({
  settings,
  brandLine,
  copyrightName = "JDL Core",
  logo = "/logo-inspection.png",
  logoAlt = "JDL Core logo",
  homeHref = "/",
  columnLabel = "Company",
  divisionLinks,
  thisDivision,
}: {
  settings: ContactSettings;
  brandLine: string;
  copyrightName?: string;
  logo?: string | null;
  logoAlt?: string;
  homeHref?: string;
  columnLabel?: string;
  divisionLinks?: FooterDivisionLink[];
  thisDivision?: FooterDivisionLink[];
}) {
  const wa = whatsappLink(settings);
  return (
    <footer className="relative overflow-hidden bg-navy-950 pt-18 pb-7 text-[rgba(248,247,243,0.75)]">
      <div className="pointer-events-none absolute -top-40 right-0 size-96 rounded-full bg-gold-500/7 blur-3xl" />
      <div className="wrap relative grid grid-cols-1 gap-10 border-b border-white/10 pb-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link href={homeHref} aria-label={logoAlt} className="inline-block">
            {logo ? (
              <Image src={logo} alt={logoAlt} width={220} height={90} className="h-12 w-auto object-contain" />
            ) : (
              <span className="font-display text-lg font-bold text-paper">{logoAlt}</span>
            )}
          </Link>
          <p className="mt-4 max-w-sm text-[0.9rem] leading-6 text-paper/60">{brandLine}</p>
        </div>

        {divisionLinks && divisionLinks.length > 0 && (
          <div>
            <h4 className="mb-4 text-[0.85rem] tracking-[0.06em] uppercase text-paper">
              {columnLabel}
            </h4>
            <nav
              aria-label={`Footer ${columnLabel.toLowerCase()}`}
              className="flex flex-col gap-2.5 text-[0.92rem]"
            >
              {divisionLinks.map((l) => (
                <Link key={l.href + l.label} href={l.href} className="group inline-flex items-center gap-1 hover:text-gold-300">
                  {l.label}<ArrowUpRight aria-hidden="true" className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </nav>
          </div>
        )}

        {thisDivision && (
          <div>
            <h4 className="mb-4 text-[0.85rem] tracking-[0.06em] uppercase text-paper">
              This Division
            </h4>
            <nav
              aria-label="Footer division links"
              className="flex flex-col gap-2.5 text-[0.92rem]"
            >
              {thisDivision.map((l) => (
                <Link key={l.href + l.label} href={l.href} className="group inline-flex items-center gap-1 hover:text-gold-300">
                  {l.label}<ArrowUpRight aria-hidden="true" className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              ))}
            </nav>
          </div>
        )}

        <div>
          <h4 className="mb-4 text-[0.85rem] tracking-[0.06em] uppercase text-paper">
            Contact
          </h4>
          <ul className="flex flex-col gap-3 text-[0.92rem]">
            <li>
              <span className="mb-1 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-wider text-paper/40"><Phone aria-hidden="true" className="size-3" />
                Phone
              </span>
              <a href={settings.phoneHref} className="hover:text-gold-300">
                {settings.phoneDisplay}
              </a>
            </li>
            <li>
              <span className="mb-1 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-wider text-paper/40"><Mail aria-hidden="true" className="size-3" />
                Email
              </span>
              <a href={`mailto:${settings.emailInfo}`} className="hover:text-gold-300">
                {settings.emailInfo}
              </a>
            </li>
            <li className="flex items-start gap-1.5 text-paper/60"><MapPin aria-hidden="true" className="mt-1 size-3 shrink-0" />{settings.address}</li>
            <li>
              <a
                className="inline-flex items-center gap-2 text-[0.92rem] text-[rgba(248,247,243,0.85)] hover:text-gold-300"
                href={wa}
                target="_blank"
                rel="noopener"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#25d366]">
                  <WhatsAppIcon className="h-[15px] w-[15px] fill-white" />
                </span>
                Message on WhatsApp
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="wrap pt-6 text-center text-[0.82rem]">
        <nav aria-label="Legal" className="mb-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[0.78rem] text-paper/55">
          <Link href="/privacy" className="hover:text-gold-300">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-gold-300">Terms of Use</Link>
          <Link href="/cookies" className="hover:text-gold-300">Cookie Policy</Link>
        </nav>
        <p>
          &copy; {new Date().getFullYear()} {copyrightName}. All rights
          reserved. Integrity at the Core.
        </p>
        <p className="mt-1.5 text-[0.75rem] text-[rgba(248,247,243,0.45)]">
          Built by{" "}
          <a
            href="https://princecaleb.dev"
            target="_blank"
            rel="noopener"
            className="underline underline-offset-2 hover:text-gold-300"
          >
            princecaleb.dev
          </a>
        </p>
      </div>
    </footer>
  );
}
