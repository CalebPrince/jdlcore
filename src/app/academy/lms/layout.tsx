import { LmsShell } from "@/components/academy/lms-shell";

export default function AcademyLmsLayout({ children }: { children: React.ReactNode }) {
  return <LmsShell>{children}</LmsShell>;
}
