import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, LockKeyhole } from "lucide-react";

export function AuthShell({
  children,
  brand,
  title,
  description,
  backHref,
  backLabel,
  logo,
  eyebrow = "Secure workspace",
  panelTitle,
  panelDescription,
  highlights,
}: {
  children: React.ReactNode;
  brand: string;
  title: string;
  description: string;
  backHref: string;
  backLabel: string;
  logo?: string;
  eyebrow?: string;
  panelTitle: string;
  panelDescription: string;
  highlights: string[];
}) {
  return (
    <main className="auth-shell min-h-dvh lg:grid lg:grid-cols-[minmax(0,0.94fr)_minmax(520px,1.06fr)]">
      <section className="auth-form-panel relative flex min-h-dvh flex-col bg-paper px-5 py-6 sm:px-10 sm:py-8 lg:px-14 xl:px-20">
        <div className="flex items-center justify-between">
          <Link href={backHref} className="auth-back-link">
            <ArrowLeft aria-hidden="true" className="size-4" />
            {backLabel}
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold text-ink-faint">
            <LockKeyhole aria-hidden="true" className="size-3.5 text-gold-600" />
            Secure access
          </div>
        </div>

        <div className="auth-form-content my-auto w-full max-w-[470px] self-center py-12">
          <Link href={backHref} aria-label={brand} className="mb-10 inline-flex min-h-12 items-center">
            {logo ? (
              <Image src={logo} alt={brand} width={240} height={96} priority className="h-14 w-auto object-contain" />
            ) : (
              <span className="font-display text-xl font-bold tracking-[-0.03em] text-navy-950">{brand}</span>
            )}
          </Link>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mb-0 text-[clamp(2.2rem,4vw,3.3rem)] font-semibold tracking-[-0.05em]">{title}</h1>
          <p className="mt-3 max-w-md text-[0.98rem] leading-7 text-ink-soft">{description}</p>
          <div className="mt-8">{children}</div>
        </div>

        <p className="text-center text-xs text-ink-faint lg:text-left">© {new Date().getFullYear()} JDL Core. Integrity at the Core.</p>
      </section>

      <aside className="auth-context-panel relative hidden overflow-hidden bg-navy-950 p-12 text-paper lg:flex lg:flex-col xl:p-16">
        <div className="auth-panel-grid" aria-hidden="true" />
        <div className="auth-panel-glow" aria-hidden="true" />
        <div className="relative z-10 flex items-center gap-3 text-sm font-semibold">
          <span className="grid size-9 place-items-center rounded-xl border border-white/12 bg-white/8">
            <LockKeyhole aria-hidden="true" className="size-4 text-gold-300" />
          </span>
          {brand}
        </div>
        <div className="relative z-10 my-auto max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-gold-300">Designed for confidence</p>
          <h2 className="mt-5 text-[clamp(2.7rem,4.5vw,5rem)] font-semibold leading-[1.02] tracking-[-0.055em] text-white">{panelTitle}</h2>
          <p className="mt-6 max-w-lg text-base leading-7 text-white/58">{panelDescription}</p>
          <ul className="mt-10 grid gap-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-white/78">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gold-500 text-navy-950"><Check aria-hidden="true" className="size-3.5" strokeWidth={2.5} /></span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-white/35">Private · Encrypted · Role-based</p>
      </aside>
    </main>
  );
}
