"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type BellNotification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string | Date;
};

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function NotificationBell({
  initialUnreadCount,
  initialNotifications,
  dark = false,
}: {
  initialUnreadCount: number;
  initialNotifications: BellNotification[];
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState(initialNotifications);
  const [, startTransition] = useTransition();

  function handleItemClick(id: number) {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - (items.find((n) => n.id === id)?.read ? 0 : 1)));
    startTransition(() => {
      markNotificationRead(id);
    });
  }

  function handleMarkAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    startTransition(() => {
      markAllNotificationsRead();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Notifications"
          className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
            dark
              ? "border-[rgba(248,247,243,0.35)] text-paper hover:bg-white/10"
              : "border-navy-200 text-navy-800 hover:bg-gold-100"
          }`}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-600 px-1 text-[0.6rem] font-bold text-navy-950">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm font-bold text-navy-950">Notifications</span>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-semibold text-gold-700 hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="m-0 p-4 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            items.map((n) => {
              const content = (
                <div
                  className={`flex flex-col gap-0.5 border-b px-3 py-2.5 text-left transition-colors hover:bg-paper-deep ${
                    n.read ? "" : "bg-[rgba(201,142,18,0.06)]"
                  }`}
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-600" />}
                    <span className={`text-sm ${n.read ? "text-ink-soft" : "font-semibold text-navy-950"}`}>
                      {n.title}
                    </span>
                  </div>
                  {n.body && <p className="m-0 pl-3.5 text-xs text-muted-foreground">{n.body}</p>}
                  <span className="pl-3.5 text-[0.7rem] text-ink-faint">
                    {dateTimeFmt.format(new Date(n.createdAt))}
                  </span>
                </div>
              );
              return n.link ? (
                <Link key={n.id} href={n.link} onClick={() => handleItemClick(n.id)} className="block">
                  {content}
                </Link>
              ) : (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n.id)}
                  className="block w-full"
                >
                  {content}
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
