import Link from "next/link";
import { redirect } from "next/navigation";
import { getPortalClient } from "@/lib/portal-auth";
import { portalLogout } from "@/app/actions/portal";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { recentNotifications, unreadCount } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = await getPortalClient();
  if (!client) redirect("/portal/login");

  const [unread, notifs] = await Promise.all([
    unreadCount("client", client.id),
    recentNotifications("client", client.id),
  ]);

  return (
    <div className="flex min-h-screen flex-col bg-paper-deep">
      <header className="bg-navy-950 text-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/portal" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-inspection.png"
              alt="JDL Core logo"
              className="h-9 brightness-0 invert"
            />
            <span className="hidden font-display text-sm font-bold tracking-[0.08em] uppercase text-paper sm:inline">
              Client Portal
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-4">
            <Link
              href="/portal"
              className="text-sm text-[rgba(248,247,243,0.8)] transition-colors hover:text-paper"
            >
              My Jobs
            </Link>
            <Link
              href="/portal/request"
              className="text-sm text-[rgba(248,247,243,0.8)] transition-colors hover:text-paper"
            >
              Request Service
            </Link>
            <span className="hidden text-sm text-[rgba(248,247,243,0.55)] md:inline">
              {client.name}
              {client.company ? ` · ${client.company}` : ""}
            </span>
            <NotificationBell initialUnreadCount={unread} initialNotifications={notifs} dark />
            <form action={portalLogout}>
              <Button
                variant="outline"
                size="sm"
                className="border-[rgba(248,247,243,0.35)] bg-transparent text-paper hover:bg-white/10 hover:text-paper"
                type="submit"
              >
                Sign Out
              </Button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
      <footer className="py-6 text-center text-xs text-ink-faint">
        <p className="m-0">
          JDL Core Client Portal · Integrity at the Core
        </p>
      </footer>
    </div>
  );
}
