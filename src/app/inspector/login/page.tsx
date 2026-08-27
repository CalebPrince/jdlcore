import { redirect } from "next/navigation";
import { getInspector } from "@/lib/inspector-auth";
import { InspectorLoginForm } from "@/components/inspector/inspector-login-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const dynamic = "force-dynamic";

export default async function InspectorLoginPage() {
  const inspector = await getInspector();
  if (inspector) redirect("/inspector");
  return (
    <AuthShell
      brand="JDL Core Inspector Portal"
      title="Ready for the field."
      description="Sign in to review assigned jobs and submit complete inspection records."
      backHref="/inspection"
      backLabel="Back to Inspection Services"
      logo="/logo-inspection.png"
      panelTitle="Field work, clearly documented."
      panelDescription="Everything an inspector needs to move from assignment through submission with a consistent evidence trail."
      highlights={["Review assigned jobs", "Capture field measurements", "Submit documentation for review"]}
    >
      <InspectorLoginForm />
    </AuthShell>
  );
}
