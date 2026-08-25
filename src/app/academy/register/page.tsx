import { redirect } from "next/navigation";
import { AcademyAuthForm } from "@/components/academy/auth-form";
import { AcademyAuthFrame } from "@/components/academy/auth-frame";
import { getAcademyLearner } from "@/lib/academy-auth";

export default async function AcademyRegisterPage() {
  if (await getAcademyLearner()) redirect("/academy/lms");
  return <AcademyAuthFrame title="Create your learner account" description="Start a structured path through petroleum measurement and operations."><AcademyAuthForm mode="register" /></AcademyAuthFrame>;
}
