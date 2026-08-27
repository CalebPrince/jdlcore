import { LoginForm } from "@/components/admin/login-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function AdminLoginPage() {
  return (
    <AuthShell
      brand="JDL Core Admin"
      title="Welcome back."
      description="Sign in with your staff account to manage the JDL Core operation."
      backHref="/"
      backLabel="Back to JDL Core"
      logo="/logo-inspection.png"
      panelTitle="One clear view of the work."
      panelDescription="Coordinate inspections, clients, reports, and settings from a secure operational workspace."
      highlights={["Manage jobs from request to report", "Keep client and field teams aligned", "Maintain a clear operational record"]}
    >
      <LoginForm />
    </AuthShell>
  );
}
