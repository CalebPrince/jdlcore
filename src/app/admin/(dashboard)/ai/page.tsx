import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiSettingsForm } from "@/components/admin/ai-settings-form";
import { getStaff } from "@/lib/staff-auth";
import {
  getAiSettings,
  maskKey,
  PROVIDER_LABELS,
  PROVIDER_ORDER,
} from "@/lib/ai/settings";

export const dynamic = "force-dynamic";

export default async function AdminAiSettingsPage() {
  const current = await getStaff();
  if (!current || current.role !== "superadmin") notFound();

  const s = await getAiSettings();
  const anyConfigured = PROVIDER_ORDER.some((p) => s[`${p}Key`]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-navy-950">AI Settings</h1>
        <p className="text-sm text-muted-foreground">
          Keys for the AI providers that power the live chat and other AI features.
        </p>
      </div>

      {!anyConfigured && (
        <Alert className="border-[rgba(201,142,18,0.4)] bg-[rgba(246,207,110,0.12)]">
          <AlertDescription className="text-navy-950">
            No API keys configured yet. The live chat is running in scripted demo mode until
            you add at least one provider key.
          </AlertDescription>
        </Alert>
      )}

      {anyConfigured && (
        <Alert className="border-[rgba(31,122,77,0.3)] bg-[rgba(31,122,77,0.06)]">
          <AlertDescription className="text-navy-950">
            Failover chain:{" "}
            <span className="font-semibold">
              {PROVIDER_ORDER.filter((p) => s[`${p}Enabled`] && s[`${p}Key`])
                .map((p) => PROVIDER_LABELS[p])
                .join(" → ") || "none enabled"}
            </span>
          </AlertDescription>
        </Alert>
      )}

      <AiSettingsForm
        view={{
          providers: Object.fromEntries(
            PROVIDER_ORDER.map((p) => [
              p,
              {
                label: PROVIDER_LABELS[p],
                model: s[`${p}Model`],
                enabled: s[`${p}Enabled`],
                maskedKey: maskKey(s[`${p}Key`]),
                hasKey: Boolean(s[`${p}Key`]),
              },
            ]),
          ) as AiSettingsParameters,
          chatPersona: s.chatPersona,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-display">How this works</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Keys are stored in your Supabase database and only ever used server-side; they
            are never sent to the browser. You can also set GEMINI_API_KEY,
            ANTHROPIC_API_KEY or GROQ_API_KEY as environment variables as a fallback.
          </p>
          <p>
            When the chat assistant receives a message it tries the first provider in the
            chain. If that provider errors, times out or returns an empty reply, the request
            automatically moves to the next provider within a shared 30 second budget. If
            every provider fails, the chat falls back to its built-in scripted responses.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

type AiSettingsParameters = Record<
  (typeof PROVIDER_ORDER)[number],
  { label: string; model: string; enabled: boolean; maskedKey: string | null; hasKey: boolean }
>;
