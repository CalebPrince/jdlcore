"use client";

import Link from "next/link";
import { LogOut, Menu } from "lucide-react";
import { portalLogout } from "@/app/actions/portal";
import { inspectorLogout } from "@/app/actions/inspector";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileWorkspaceMenu({
  kind,
  name,
  subtitle,
  links,
}: {
  kind: "portal" | "inspector";
  name: string;
  subtitle?: string;
  links: { href: string; label: string }[];
}) {
  const logout = kind === "portal" ? portalLogout : inspectorLogout;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="size-10 rounded-full border-navy-900/10 bg-white md:hidden" aria-label="Open navigation">
          <Menu aria-hidden="true" className="size-4.5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(340px,88vw)] border-navy-900/8 bg-paper p-0">
        <SheetHeader className="border-b border-navy-900/8 px-6 py-5 text-left">
          <SheetTitle className="font-display text-lg text-navy-950">{kind === "portal" ? "Client Portal" : "Inspector Portal"}</SheetTitle>
          <div>
            <p className="text-sm font-semibold text-navy-950">{name}</p>
            {subtitle ? <p className="text-xs text-ink-faint">{subtitle}</p> : null}
          </div>
        </SheetHeader>
        <nav className="flex flex-col gap-1 p-4" aria-label="Mobile workspace navigation">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="flex min-h-12 items-center rounded-xl px-4 text-sm font-semibold text-ink-soft transition-colors hover:bg-navy-100 hover:text-navy-950">
              {link.label}
            </Link>
          ))}
        </nav>
        <form action={logout} className="absolute inset-x-4 bottom-5">
          <Button type="submit" variant="outline" className="h-11 w-full justify-start rounded-xl border-navy-900/10">
            <LogOut aria-hidden="true" /> Sign out
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
