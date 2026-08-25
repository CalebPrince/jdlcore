"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  Settings2,
  ExternalLink,
  LogOut,
  ShieldCheck,
  Bot,
  Users,
  ClipboardList,
  Mail,
  BarChart3,
  GraduationCap,
  Award,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/actions/admin";
import { useState } from "react";

const NAV: { href: string; label: string; icon: React.ElementType; exact?: boolean }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/inbox", label: "Inbox", icon: Inbox },
  { href: "/admin/jobs", label: "Jobs", icon: ClipboardList },
  { href: "/admin/clients", label: "Clients", icon: Users },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/academy", label: "Academy", icon: GraduationCap },
  { href: "/admin/academy/credentials", label: "Credentials", icon: Award },
  { href: "/admin/settings", label: "Site Settings", icon: Settings2 },
  { href: "/admin/email", label: "Email", icon: Mail },
  { href: "/admin/ai", label: "AI Settings", icon: Bot },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-[rgba(238,176,43,0.15)] text-gold-300"
                : "text-[rgba(248,247,243,0.65)] hover:bg-white/5 hover:text-paper"
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
            {active && (
              <span className="ml-auto h-4 w-1 rounded-full bg-gold-500" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-navy-950 text-paper">
      <div className="flex items-center gap-3 px-5 py-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-inspection.png" alt="" className="h-9 w-auto" />
        <div>
          <p className="font-display text-sm font-bold leading-tight">
            JDL Core
          </p>
          <p className="flex items-center gap-1 text-[0.7rem] tracking-wide uppercase text-[rgba(248,247,243,0.45)]">
            <ShieldCheck className="h-3 w-3 text-gold-500" /> Command Center
          </p>
        </div>
      </div>

      <div className="px-4">
        <NavLinks onNavigate={onNavigate} />
      </div>

      <div className="mt-auto flex flex-col gap-1 px-4 pb-6">
        <Link
          href="/"
          target="_blank"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-[rgba(248,247,243,0.65)] transition-colors hover:bg-white/5 hover:text-paper"
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          View Site
        </Link>
        <form action={logout}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-left text-sm font-medium text-[rgba(248,247,243,0.65)] transition-colors hover:bg-white/5 hover:text-paper"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign Out
          </button>
        </form>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[250px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh border-r border-white/10 lg:block">
        <SidebarInner />
      </aside>

      <div className="flex min-h-dvh flex-col">
        {/* Mobile top bar */}
        <header className="flex items-center justify-between border-b bg-navy-950 px-4 py-3 text-paper lg:hidden">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-inspection.png" alt="" className="h-8 w-auto" />
            <span className="font-display text-sm font-bold">Command Center</span>
          </div>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="border-white/20 bg-transparent text-paper hover:bg-white/10 hover:text-paper"
                aria-label="Open menu"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[270px] p-0 [&>button]:text-paper">
              <SheetHeader className="sr-only">
                <SheetTitle>Admin navigation</SheetTitle>
              </SheetHeader>
              <SidebarInner onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
