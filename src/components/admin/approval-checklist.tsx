import { Check, X } from "lucide-react";
import type { ApprovalCheckItem } from "@/db/schema";

/** The automatic approval checks for a submitted job, shown to whoever is reviewing it. */
export function ApprovalChecklist({
  verdict,
  checks,
  mode,
}: {
  verdict: "pass" | "fail";
  checks: ApprovalCheckItem[];
  mode: string;
}) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
      <p className="m-0 text-sm font-semibold text-navy-950">
        Automatic checks: {verdict === "pass" ? "all passed" : `${checks.filter((c) => !c.ok).length} need a person`}
      </p>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
        {checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2 text-xs">
            {c.ok ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1f7a4d]" aria-label="Passed" />
            ) : (
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Needs attention" />
            )}
            <span>
              <span className="font-medium">{c.label}.</span> <span className="text-muted-foreground">{c.detail}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 mt-2 text-xs text-muted-foreground">
        {mode === "auto" && verdict === "pass"
          ? "If nobody acts first, this job will be approved automatically after the waiting period."
          : mode === "shadow"
            ? "Shadow mode: these checks are recorded for comparison only. You decide."
            : "A person needs to review this one."}
      </p>
    </div>
  );
}
