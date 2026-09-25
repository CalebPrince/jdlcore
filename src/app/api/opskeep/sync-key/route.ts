import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAiSettingsValues, PROVIDER_ORDER, type ProviderName } from "@/lib/ai/settings";

/**
 * Receives a provider key pushed from an operator's Opskeep admin dashboard, so an
 * agency managing many client sites doesn't have to paste the same key into every
 * site's own admin panel by hand. Same shared-secret pattern as the Vercel cron
 * routes (see cron-auth.ts) — OPSKEEP_SYNC_SECRET must be set, or every push is
 * refused. This is a system-to-system push, not a staff action, so it does not
 * write to the staff audit log (audit_log.actor_id is a hard foreign key to a real
 * staff row); server logs are the record here, same as the cron dispatcher below.
 */

const schema = z.object({
  provider: z.enum(PROVIDER_ORDER),
  model: z.string().max(120).optional(),
  keyValue: z.string().min(1).max(400),
  enabled: z.boolean().optional(),
});

function valuesFor(provider: ProviderName, keyValue: string, model?: string, enabled?: boolean) {
  switch (provider) {
    case "gemini":
      return { geminiKey: keyValue, geminiModel: model, geminiEnabled: enabled };
    case "anthropic":
      return { anthropicKey: keyValue, anthropicModel: model, anthropicEnabled: enabled };
    case "groq":
      return { groqKey: keyValue, groqModel: model, groqEnabled: enabled };
    case "openai":
      return { openaiKey: keyValue, openaiModel: model, openaiEnabled: enabled };
    case "openrouter":
      return { openrouterKey: keyValue, openrouterModel: model, openrouterEnabled: enabled };
    case "deepseek":
      return { deepseekKey: keyValue, deepseekModel: model, deepseekEnabled: enabled };
  }
}

export async function POST(req: Request) {
  const secret = process.env.OPSKEEP_SYNC_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "OPSKEEP_SYNC_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", detail: parsed.error.flatten() }, { status: 400 });
  }
  const { provider, model, keyValue, enabled } = parsed.data;

  try {
    await saveAiSettingsValues(valuesFor(provider, keyValue, model, enabled));
  } catch (err) {
    console.error("opskeep sync-key failed:", err);
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }

  console.log(`[opskeep-sync] ${provider} key synced${model ? ` (model: ${model})` : ""}${enabled !== undefined ? `, enabled=${enabled}` : ""}`);
  return NextResponse.json({ ok: true });
}
