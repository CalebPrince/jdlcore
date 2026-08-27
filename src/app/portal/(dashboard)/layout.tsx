import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getPortalClient } from "@/lib/portal-auth";
import { portalLogout } from "@/app/actions/portal";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { recentNotifications, unreadCount } from "@/lib/notifications";
import { MobileWorkspaceMenu } from "@/components/backend/mobile-workspace-menu";

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
    <div className="backend-shell flex min-h-screen flex-col bg-[#f4f5f2]">
      <header className="backend-topbar sticky top-0 z-40 border-b border-navy-900/8 bg-paper/85 text-navy-950 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/portal" className="flex items-center gap-2.5">
            <Image
              src="/logo-inspection.png"
              alt="JDL Core logo"
              width={180}
              height={72}
              className="h-10 w-auto object-contain"
            />
            <span className="hidden font-display text-xs font-bold tracking-[0.08em] uppercase text-navy-950 sm:inline">
              Client Portal
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1.5 md:flex">
            <Link
              href="/portal"
              className="backend-nav-link"
            >
              My Jobs
            </Link>
            <Link
              href="/portal/request"
              className="backend-nav-link"
            >
              Request Service
            </Link>
            <Link
              href="/portal/reports"
              className="backend-nav-link"
            >
              Reports
            </Link>
            <span className="hidden text-sm text-ink-faint md:inline">
              {client.name}
              {client.company ? ` · ${client.company}` : ""}
            </span>
            <NotificationBell initialUnreadCount={unread} initialNotifications={notifs} />
            <form action={portalLogout}>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-navy-900/12 bg-white text-navy-950 hover:bg-navy-100"
                type="submit"
              >
                Sign Out
              </Button>
            </form>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:hidden">
            <NotificationBell initialUnreadCount={unread} initialNotifications={notifs} />
            <MobileWorkspaceMenu
              kind="portal"
              name={client.name}
              subtitle={client.company ?? undefined}
              links={[
                { href: "/portal", label: "My Jobs" },
                { href: "/portal/request", label: "Request Service" },
                { href: "/portal/reports", label: "Reports" },
              ]}
            />
          </div>
        </div>
      </header>
      <main className="backend-content mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
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
