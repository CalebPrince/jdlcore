import { LmsShell } from "@/components/academy/lms-shell";
import { redirect } from "next/navigation";
import { getAcademyLearner } from "@/lib/academy-auth";

export default async function AcademyLmsLayout({ children }: { children: React.ReactNode }) {
  const learner = await getAcademyLearner();
  if (!learner) redirect("/academy/login");
  return <LmsShell learner={{ name: learner.name, role: learner.role }}>{children}</LmsShell>;
}
