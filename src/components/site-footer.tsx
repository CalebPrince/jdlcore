import Link from "next/link";
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
    <footer className="bg-navy-950 pt-16 pb-6 text-[rgba(248,247,243,0.75)]">
      <div className="wrap grid grid-cols-1 gap-8 border-b border-[rgba(248,247,243,0.12)] pb-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link href={homeHref} aria-label={logoAlt} className="inline-block">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={logoAlt} className="h-11" />
            ) : (
              <span className="font-display text-lg font-bold text-paper">{logoAlt}</span>
            )}
          </Link>
          <p className="mt-3.5 text-[0.9rem]">{brandLine}</p>
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
                <Link key={l.href + l.label} href={l.href} className="hover:text-gold-300">
                  {l.label}
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
                <Link key={l.href + l.label} href={l.href} className="hover:text-gold-300">
                  {l.label}
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
              <span className="block text-[0.78rem] text-[rgba(248,247,243,0.5)]">
                Phone
              </span>
              <a href={settings.phoneHref} className="hover:text-gold-300">
                {settings.phoneDisplay}
              </a>
            </li>
            <li>
              <span className="block text-[0.78rem] text-[rgba(248,247,243,0.5)]">
                Email
              </span>
              <a href={`mailto:${settings.emailInfo}`} className="hover:text-gold-300">
                {settings.emailInfo}
              </a>
            </li>
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
