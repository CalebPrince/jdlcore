import { redirect } from "next/navigation";
import { getStaff } from "@/lib/staff-auth";
import { AdminShell } from "@/components/admin/admin-shell";
import type { StaffRole } from "@/lib/staff-auth";
import { recentNotifications, unreadCount } from "@/lib/notifications";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaff();
  if (!staff) {
    redirect("/admin/login");
  }

  const [unread, notifs] = await Promise.all([
    unreadCount("staff", staff.id),
    recentNotifications("staff", staff.id),
  ]);

  return (
    <AdminShell
      name={staff.name}
      role={staff.role as StaffRole}
      unreadCount={unread}
      notifications={notifs}
    >
      {children}
    </AdminShell>
  );
}
