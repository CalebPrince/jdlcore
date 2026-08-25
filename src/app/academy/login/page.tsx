import { redirect } from "next/navigation";
import { AcademyAuthForm } from "@/components/academy/auth-form";
import { AcademyAuthFrame } from "@/components/academy/auth-frame";
import { getAcademyLearner } from "@/lib/academy-auth";

export default async function AcademyLoginPage() {
  if (await getAcademyLearner()) redirect("/academy/lms");
  return <AcademyAuthFrame title="Welcome back" description="Continue your field learning from where you stopped."><AcademyAuthForm mode="login" /></AcademyAuthFrame>;
}
