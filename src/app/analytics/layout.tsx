import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOwnerStaff } from "@/lib/staff-auth";

// Analytics was withdrawn from JDL Core. The product is kept for reference and only
// opens for the platform owner while signed in to /admin; everyone else gets a 404.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  if (!(await getOwnerStaff())) notFound();
  return children;
}
