import { redirect } from "next/navigation";
import { getInspector } from "@/lib/inspector-auth";
import { InspectorLoginForm } from "@/components/inspector/inspector-login-form";

export const dynamic = "force-dynamic";

export default async function InspectorLoginPage() {
  const inspector = await getInspector();
  if (inspector) redirect("/inspector");
  return <InspectorLoginForm />;
}
