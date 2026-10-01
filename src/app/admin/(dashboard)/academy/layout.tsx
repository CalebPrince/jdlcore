import { notFound } from "next/navigation";
import { getStaff } from "@/lib/staff-auth";

export default async function AdminAcademyLayout({ children }: { children: React.ReactNode }) {
  const staff = await getStaff();
  if (!staff || staff.role !== "superadmin") notFound();
  return children;
}
