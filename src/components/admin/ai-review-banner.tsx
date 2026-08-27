import { Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { AiReview } from "@/db/schema";

const SEVERITY_STYLE: Record<string, string> = {
  high: "border-red-300 bg-red-50 text-red-900",
  medium: "border-[rgba(201,142,18,0.4)] bg-[rgba(246,207,110,0.14)] text-navy-950",
  low: "border-[rgba(201,142,18,0.3)] bg-[rgba(246,207,110,0.08)] text-navy-950",
};

export function AiReviewBanner({ reviews }: { reviews: AiReview[] }) {
  if (reviews.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {reviews.map((r) => (
        <Alert key={r.id} className={SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.low}>
          <Sparkles className="h-4 w-4" />
          <AlertDescription className="text-current">
            <span className="font-semibold uppercase tracking-wide">
              AI flag ({r.severity})
            </span>
            {" — "}
            {r.summary || "This looks worth a second look before you proceed."}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
