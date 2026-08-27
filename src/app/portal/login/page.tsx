import { redirect } from "next/navigation";
import { getPortalClient } from "@/lib/portal-auth";
import { PortalLoginForm } from "@/components/portal/portal-login-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const dynamic = "force-dynamic";

export default async function PortalLoginPage() {
  const client = await getPortalClient();
  if (client) redirect("/portal");
  return (
    <AuthShell
      brand="JDL Core Client Portal"
      title="Your inspections, in one place."
      description="Sign in to track active work, retrieve reports, and manage your account."
      backHref="/inspection"
      backLabel="Back to Inspection Services"
      logo="/logo-inspection.png"
      panelTitle="Visibility from request to final report."
      panelDescription="A focused client workspace for following inspection progress without chasing updates across calls and email."
      highlights={["Track inspection status", "Download reports and certificates", "Review invoices and account activity"]}
    >
      <PortalLoginForm />
    </AuthShell>
  );
}
