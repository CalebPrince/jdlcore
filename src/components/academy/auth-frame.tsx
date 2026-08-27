import { AuthShell } from "@/components/auth/auth-shell";

export function AcademyAuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <AuthShell
      brand="JDL Core Academy"
      title={title}
      description={description}
      backHref="/academy"
      backLabel="Back to Academy"
      eyebrow="Learner workspace"
      panelTitle="Learn the standard. Apply it with confidence."
      panelDescription="Practical petroleum operations learning designed around real measurements, scenarios, and field decisions."
      highlights={["Structured specialist learning paths", "Practical checks and assessments", "Documented learner progress"]}
    >
      <div className="auth-form-card">{children}</div>
    </AuthShell>
  );
}
