import { notFound } from "next/navigation";
import { getOwnerStaff } from "@/lib/staff-auth";

export default async function AdminAnalyticsLayout({ children }: { children: React.ReactNode }) {
  if (!(await getOwnerStaff())) notFound();
  return children;
}
