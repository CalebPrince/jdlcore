import Link from "next/link";
import { redirect } from "next/navigation";
import { getInspector } from "@/lib/inspector-auth";
import { inspectorLogout } from "@/app/actions/inspector";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { recentNotifications, unreadCount } from "@/lib/notifications";

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
    <div className="flex min-h-screen flex-col bg-paper-deep">
      <header className="bg-navy-950 text-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/inspector" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-inspection.png" alt="JDL Core logo" className="h-9 brightness-0 invert" />
            <span className="hidden font-display text-sm font-bold tracking-[0.08em] uppercase text-paper sm:inline">
              Inspector Portal
            </span>
          </Link>
          <nav className="ml-auto flex items-center gap-4">
            <Link
              href="/inspector"
              className="text-sm text-[rgba(248,247,243,0.8)] transition-colors hover:text-paper"
            >
              My Jobs
            </Link>
            <span className="hidden text-sm text-[rgba(248,247,243,0.55)] md:inline">
              {inspector.name}
            </span>
            <NotificationBell initialUnreadCount={unread} initialNotifications={notifs} dark />
            <form action={inspectorLogout}>
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
        <p className="m-0">JDL Core Inspector Portal · Integrity at the Core</p>
      </footer>
    </div>
  );
}
