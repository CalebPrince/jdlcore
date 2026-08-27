import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, ExternalLink } from "lucide-react";
import { getAnalyticsUser } from "@/lib/analytics-auth";
import { analyticsLogout } from "@/app/actions/analytics";

export default async function AnalyticsAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getAnalyticsUser();
  if (!user) redirect("/analytics/login");

  return (
    <div className="backend-shell flex min-h-screen flex-col bg-[#f4f5f2]">
      <header className="backend-topbar sticky top-0 z-40 hidden border-b border-white/8 bg-navy-950/96 backdrop-blur-xl md:block">
        <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/analytics/app" className="flex items-center gap-2.5 no-underline">
            <span className="font-display text-lg font-bold tracking-tight text-paper">
              JDL Core <span className="text-gold-500">Analytics</span>
            </span>
            <span className="hidden rounded-full bg-[rgba(246,207,110,0.14)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-400 sm:inline-block">
              Beta
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="hidden text-xs text-[#8fa3b0] transition-colors hover:text-paper sm:inline-flex sm:items-center sm:gap-1"
            >
              jdlcore.com <ExternalLink className="h-3 w-3" />
            </a>
            <div className="hidden text-right md:block">
              <p className="m-0 text-xs font-semibold leading-tight text-paper">{user.name}</p>
              <p className="m-0 text-[11px] leading-tight text-[#8fa3b0]">{user.email}</p>
            </div>
            <form action={analyticsLogout}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,255,255,0.18)] px-3 py-1.5 text-xs font-semibold text-paper transition-colors hover:bg-white/10"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="backend-content flex min-h-0 flex-1">{children}</main>
    </div>
  );
}
