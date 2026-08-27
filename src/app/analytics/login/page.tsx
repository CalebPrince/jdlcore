import Link from "next/link";
import type { Metadata } from "next";
import { AnalyticsLoginForm } from "@/components/analytics/auth-forms";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = { title: "Sign In | JDL Core Analytics" };

export default function AnalyticsLoginPage() {
  return (
    <AuthShell
      brand="JDL Core Analytics"
      title="Return to your workspace."
      description="Sign in to ask questions across your industry and inspection data."
      backHref="/analytics"
      backLabel="Back to Analytics"
      logo="/logo-analytics.png"
      eyebrow="Subscriber workspace"
      panelTitle="Answers grounded in the data that matters."
      panelDescription="Move from a business question to a cited, exportable answer without waiting for another static report."
      highlights={["Search inspection history", "Review cited answers", "Export decision-ready reports"]}
    >
      <div className="auth-form-card">
        <AnalyticsLoginForm />
        <p className="mt-5 text-center text-xs text-muted-foreground">
          No account yet?{" "}
          <Link href="/analytics#access" className="font-semibold text-gold-700 hover:underline">Request access</Link>
        </p>
      </div>
    </AuthShell>
  );
}
