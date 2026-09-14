import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { adminAssistantChats, adminAssistantMessages } from "@/db/schema";
import { getStaff } from "@/lib/staff-auth";
import { buildAdminAgentSystemPrompt } from "@/lib/ai/admin-assistant-prompt";
import { buildAdminAssistantSystemPrompt } from "@/lib/ai/admin-assistant";
import type { EvidenceItem } from "@/lib/ai/admin-assistant-tools";
import { ADMIN_AGENT_TOOLS, executeAdminAgentTool } from "@/lib/ai/agent-tools";
import { runBoundedAgent } from "@/lib/ai/agent-runner";
import { AiUnavailableError, runCompletion } from "@/lib/ai/gateway";
import { getAiSettings, PROVIDER_ORDER } from "@/lib/ai/settings";
import { rateLimit } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  chatId: z.coerce.number().int().positive().optional(),
  message: z.string().trim().min(1).max(1000),
});

/**
 * Roadmap step 4: if at least one provider has been marked validated for
 * agent tool calls (Admin > AI Settings — off by default for every
 * provider), let the model itself choose which read tools to call in a
 * bounded loop instead of the step-3 keyword-routed lookup. Returns null to
 * fall back to that lookup mode — either because no provider is validated,
 * or because the run itself failed (never lets an agent-mode failure become
 * a hard error for the user when the older, simpler path can still answer).
 */
async function tryAgentMode(
  staff: { id: number; name: string; role: string },
  message: string,
): Promise<{ reply: string; evidence: EvidenceItem[] } | null> {
  const settings = await getAiSettings();
  const agentCapable = PROVIDER_ORDER.some(
    (p) => settings[`${p}Enabled`] && settings[`${p}Key`] && settings[`${p}AgentToolsValidated`],
  );
  if (!agentCapable) return null;

  try {
    const outcome = await runBoundedAgent({
      staff,
      goal: message,
      system: buildAdminAgentSystemPrompt(staff),
      tools: ADMIN_AGENT_TOOLS,
      executeTool: (call) => executeAdminAgentTool(staff, call),
      limits: { maxSteps: 6, maxWallClockMs: 45_000, maxTotalTokens: 20_000 },
    });
    if (outcome.status === "failed") return null;
    return {
      reply:
        outcome.finalText ||
        "I couldn't reach a definitive answer within the step/time limit for this question — try rephrasing or narrowing it.",
      evidence: outcome.evidence,
    };
  } catch (err) {
    console.error("admin assistant agent mode:", err);
    return null;
  }
}

export async function POST(req: Request) {
  const staff = await getStaff();
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimit(`admin-assistant:${staff.id}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many messages. Please try again shortly." },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Message must be between 1 and 1000 characters." }, { status: 400 });
  }

  let database;
  try {
    database = requireDb();
  } catch {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503 });
  }

  // Resolve or create the chat, verifying ownership (a staff member may only
  // append to their own conversations).
  let chatId = parsed.data.chatId ?? null;
  if (chatId) {
    const owned = await database
      .select({ id: adminAssistantChats.id })
      .from(adminAssistantChats)
      .where(and(eq(adminAssistantChats.id, chatId), eq(adminAssistantChats.staffId, staff.id)))
      .limit(1);
    if (!owned[0]) chatId = null;
  }
  if (!chatId) {
    const created = await database
      .insert(adminAssistantChats)
      .values({
        staffId: staff.id,
        title: parsed.data.message.slice(0, 60) + (parsed.data.message.length > 60 ? "…" : ""),
      })
      .returning({ id: adminAssistantChats.id });
    chatId = created[0].id;
  }

  await database.insert(adminAssistantMessages).values({
    chatId,
    role: "user",
    content: parsed.data.message,
  });

  const history = await database
    .select({ role: adminAssistantMessages.role, content: adminAssistantMessages.content })
    .from(adminAssistantMessages)
    .where(eq(adminAssistantMessages.chatId, chatId))
    .orderBy(asc(adminAssistantMessages.createdAt));
  const recent = history.slice(-14);

  try {
    const agentResult = await tryAgentMode(staff, parsed.data.message);

    let reply: string;
    let evidence: EvidenceItem[];
    let provider: string | null;
    let mode: "agent" | "lookup";
    if (agentResult) {
      reply = agentResult.reply;
      evidence = agentResult.evidence;
      provider = null;
      mode = "agent";
    } else {
      const built = await buildAdminAssistantSystemPrompt(staff, parsed.data.message);
      const completion = await runCompletion({
        system: built.system,
        turns: recent.map((m) => ({
          role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        })),
        maxTokens: 800,
        totalTimeoutMs: 30_000,
      });
      reply = completion.text;
      evidence = built.evidence;
      provider = completion.provider;
      mode = "lookup";
    }

    await database.insert(adminAssistantMessages).values({
      chatId,
      role: "assistant",
      content: reply,
      evidence,
    });

    return NextResponse.json({ reply, chatId, provider, evidence, mode });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "The assistant is temporarily unavailable. Please try again in a moment." },
        { status: 503 },
      );
    }
    console.error("admin assistant chat:", err);
    return NextResponse.json({ error: "Something went wrong handling your question." }, { status: 500 });
  }
}
