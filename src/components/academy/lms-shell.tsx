"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Gauge, GraduationCap, Menu, Settings, Trophy } from "lucide-react";
import { useState } from "react";
import { academyLogout } from "@/app/actions/academy";

const nav = [
  { href: "/academy/lms", label: "Overview", icon: Gauge, exact: true },
  { href: "/academy/lms#learning-plan", label: "My learning", icon: BookOpen, exact: true },
  { href: "/academy/courses", label: "Course library", icon: GraduationCap },
  { href: "/academy/lms#certificates", label: "Certificates", icon: Trophy },
];

function Navigation({ close }: { close?: () => void }) {
  const pathname = usePathname();
  return <>
    <Link href="/academy" className="mb-10 flex items-center gap-3 px-2" onClick={close}>
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold-500 font-display font-bold text-navy-950">J</span>
      <span><b className="block font-display text-sm text-white">JDL Core Academy</b><small className="text-[10px] font-bold uppercase tracking-[.18em] text-white/45">Learning console</small></span>
    </Link>
    <nav className="space-y-1">
      {nav.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href.split("#")[0]);
        return <Link key={label} href={href} onClick={close} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active ? "bg-white/10 text-gold-300" : "text-white/60 hover:bg-white/5 hover:text-white"}`}><Icon className="h-4 w-4" />{label}</Link>;
      })}
    </nav>
    <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-gold-300">Field note</p>
      <p className="mt-2 text-xs leading-5 text-white/55">Complete the equipment check before beginning any practical exercise.</p>
    </div>
    <form action={academyLogout} className="mt-4"><button className="flex w-full items-center gap-3 px-3 py-2 text-sm text-white/50"><Settings className="h-4 w-4" /> Sign out</button></form>
  </>;
}

export function LmsShell({ children, learner }: { children: React.ReactNode; learner: { name: string; role: string } }) {
  const [open, setOpen] = useState(false);
  const initials = learner.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  return <div className="backend-shell min-h-dvh bg-[#f4f5f2] lg:grid lg:grid-cols-[264px_1fr]">
    <aside className="backend-sidebar sticky top-0 hidden h-dvh flex-col bg-navy-950 p-5 lg:flex"><Navigation /></aside>
    {open ? <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} /><aside className="relative flex h-full w-[280px] flex-col bg-navy-950 p-5"><Navigation close={() => setOpen(false)} /></aside></div> : null}
    <div className="min-w-0"><header className="backend-topbar sticky top-0 z-40 flex h-[72px] items-center justify-between border-b border-black/5 bg-white/82 px-5 backdrop-blur-xl lg:px-8"><button onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-full border border-black/8 bg-white lg:hidden" aria-label="Open menu"><Menu /></button><p className="hidden text-sm text-ink-soft sm:block">Learn it. Check it. Use it in the field.</p><div className="ml-auto flex items-center gap-3"><span className="hidden text-right sm:block"><b className="block text-xs text-navy-950">{learner.name}</b><small className="text-[11px] text-ink-faint">{learner.role}</small></span><span className="grid h-10 w-10 place-items-center rounded-full border border-navy-900/8 bg-navy-100 text-xs font-bold text-navy-800">{initials}</span></div></header><div className="backend-content">{children}</div></div>
  </div>;
}
