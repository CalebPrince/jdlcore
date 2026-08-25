import { NextResponse } from "next/server";
import { z } from "zod";
import { AiUnavailableError, runCompletion, type ChatTurn } from "@/lib/ai/gateway";
import { buildChatSystemPrompt } from "@/lib/ai/chat-prompt";
import { rateLimit, clientIp } from "@/lib/ai/rate-limit";

export const dynamic = "force-dynamic";

const turnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const bodySchema = z.object({
  message: z.string().trim().min(1).max(1000),
  history: z.array(turnSchema).max(20).optional(),
});

export async function POST(req: Request) {
  const rl = rateLimit(`chat:${clientIp(req)}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many messages. Please try again later." },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const [system] = await Promise.all([buildChatSystemPrompt()]);
    const turns: ChatTurn[] = [
      ...(payload.history ?? []),
      { role: "user", content: payload.message },
    ];
    const result = await runCompletion({ system, turns, maxTokens: 700, totalTimeoutMs: 30_000 });
    return NextResponse.json({
      reply: result.text,
      mode: "ai",
      provider: result.provider,
    });
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      console.error("[chat] AI unavailable:", err.failures.join(" | "));
      return NextResponse.json({ reply: null, mode: "unavailable", provider: null });
    }
    throw err;
  }
}
