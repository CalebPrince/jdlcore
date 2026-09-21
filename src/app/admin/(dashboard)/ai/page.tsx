import { notFound } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiSettingsForm } from "@/components/admin/ai-settings-form";
import { KnowledgeForm } from "@/components/admin/knowledge-form";
import { loadKnowledgeRegistry } from "@/lib/ai/knowledge-store";
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
  const registry = await loadKnowledgeRegistry().catch(() => null);
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

      {registry ? <KnowledgeForm registry={registry} /> : <Alert><AlertDescription>Platform knowledge could not be loaded. Reload when the database is available to edit it.</AlertDescription></Alert>}

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
            Keys are stored securely and are never shown in the browser or sent to visitors.
          </p>
          <p>
            The chat assistant uses the first provider in the list. If that one is busy or
            fails to answer, it automatically tries the next. If none of them can answer, the
            chat falls back to its built-in replies, so visitors are never left without a response.
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
