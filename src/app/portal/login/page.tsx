import { redirect } from "next/navigation";
import { getPortalClient } from "@/lib/portal-auth";
import { PortalLoginForm } from "@/components/portal/portal-login-form";

export const dynamic = "force-dynamic";

export default async function PortalLoginPage() {
  const client = await getPortalClient();
  if (client) redirect("/portal");
  return <PortalLoginForm />;
}
