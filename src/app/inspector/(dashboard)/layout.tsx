import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getInspector } from "@/lib/inspector-auth";
import { inspectorLogout } from "@/app/actions/inspector";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { recentNotifications, unreadCount } from "@/lib/notifications";
import { MobileWorkspaceMenu } from "@/components/backend/mobile-workspace-menu";

export const dynamic = "force-dynamic";

export default async function InspectorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const inspector = await getInspector();
  if (!inspector) redirect("/inspector/login");

  const [unread, notifs] = await Promise.all([
    unreadCount("inspector", inspector.id),
    recentNotifications("inspector", inspector.id),
  ]);

  return (
    <div className="backend-shell flex min-h-screen flex-col bg-[#f4f5f2]">
      <header className="backend-topbar sticky top-0 z-40 border-b border-navy-900/8 bg-paper/85 text-navy-950 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/inspector" className="flex items-center gap-2.5">
            <Image src="/logo-inspection.png" alt="JDL Core logo" width={180} height={72} className="h-10 w-auto object-contain" />
            <span className="hidden font-display text-xs font-bold tracking-[0.08em] uppercase text-navy-950 sm:inline">
              Inspector Portal
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1.5 md:flex">
            <Link
              href="/inspector"
              className="backend-nav-link"
            >
              My Jobs
            </Link>
            <span className="hidden text-sm text-ink-faint md:inline">
              {inspector.name}
            </span>
            <NotificationBell initialUnreadCount={unread} initialNotifications={notifs} />
            <form action={inspectorLogout}>
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
              kind="inspector"
              name={inspector.name}
              links={[{ href: "/inspector", label: "My Jobs" }]}
            />
          </div>
        </div>
      </header>
      <main className="backend-content mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
        {children}
      </main>
      <footer className="py-6 text-center text-xs text-ink-faint">
        <p className="m-0">JDL Core Inspector Portal · Integrity at the Core</p>
      </footer>
    </div>
  );
}
