import { redirect } from "next/navigation";
import { getStaff } from "@/lib/staff-auth";
import { AdminShell } from "@/components/admin/admin-shell";
import type { StaffRole } from "@/lib/staff-auth";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const staff = await getStaff();
  if (!staff) {
    redirect("/admin/login");
  }

  return (
    <AdminShell name={staff.name} role={staff.role as StaffRole}>
      {children}
    </AdminShell>
  );
}
