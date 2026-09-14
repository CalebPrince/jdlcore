import "server-only";
import { eq } from "drizzle-orm";
import { requireDb } from "@/db";
import { agentRuns, agentSteps } from "@/db/schema";
import { AiUnavailableError, runAgentStep, type AgentTurn, type ToolCall, type ToolDefinition } from "./gateway";
import type { EvidenceItem } from "./admin-assistant-tools";

export type AgentRunLimits = {
  /** Bounds the number of model turns — each turn may itself request several tool calls. */
  maxSteps: number;
  maxWallClockMs: number;
  /**
   * Total input+output tokens across the run. This app has no metered
   * per-token billing wired in anywhere, so token count is the closest real
   * signal to a "spending" limit available today — treat it as that proxy,
   * not an actual currency budget.
   */
  maxTotalTokens: number;
};

const DEFAULT_LIMITS: AgentRunLimits = { maxSteps: 6, maxWallClockMs: 45_000, maxTotalTokens: 20_000 };
const MIN_STEP_TIME_MS = 3_000;

export type AgentRunOutcome = {
  runId: number | null;
  status: "completed" | "stopped_limit" | "failed";
  stopReason: "completed" | "max_steps" | "max_time" | "max_tokens" | "error";
  finalText: string;
  evidence: EvidenceItem[];
  steps: number;
};

/**
 * Runs a bounded tool-calling agent loop (roadmap step 4): the model chooses
 * which of `tools` to call, `executeTool` runs the actual scoped lookup, and
 * the loop feeds results back until the model gives a final text answer or
 * one of the step/time/token limits is hit. Every step and tool call is
 * persisted to agent_runs/agent_steps as it happens, so a run that fails or
 * hits a limit mid-way still leaves a full audit trail.
 */
export async function runBoundedAgent(input: {
  staff: { id: number };
  goal: string;
  system: string;
  tools: ToolDefinition[];
  executeTool: (call: ToolCall) => Promise<EvidenceItem[] | { error: string }>;
  limits?: Partial<AgentRunLimits>;
}): Promise<AgentRunOutcome> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const database = requireDb();

  const created = await database.insert(agentRuns).values({ staffId: input.staff.id, goal: input.goal }).returning({ id: agentRuns.id });
  const runId = created[0].id;

  const turns: AgentTurn[] = [{ role: "user", content: input.goal }];
  const allEvidence: EvidenceItem[] = [];
  const deadline = Date.now() + limits.maxWallClockMs;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let stepNumber = 0;
  let status: AgentRunOutcome["status"] = "failed";
  let stopReason: AgentRunOutcome["stopReason"] = "error";
  let finalText = "";

  try {
    stepLoop: while (stepNumber < limits.maxSteps) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_STEP_TIME_MS) {
        status = "stopped_limit";
        stopReason = "max_time";
        break;
      }
      stepNumber += 1;

      const step = await runAgentStep({
        system: input.system,
        turns,
        tools: input.tools,
        maxTokens: 800,
        totalTimeoutMs: Math.min(remaining, 25_000),
      });

      if (step.usage) {
        totalInputTokens += step.usage.inputTokens;
        totalOutputTokens += step.usage.outputTokens;
      }

      await database.insert(agentSteps).values({
        runId,
        stepNumber,
        role: "assistant",
        content: step.text,
        toolCalls: step.toolCalls.length ? step.toolCalls : null,
        provider: step.provider,
        inputTokens: step.usage?.inputTokens ?? null,
        outputTokens: step.usage?.outputTokens ?? null,
      });
      turns.push({ role: "assistant", content: step.text, toolCalls: step.toolCalls.length ? step.toolCalls : undefined });

      if (step.toolCalls.length === 0) {
        finalText = step.text;
        status = "completed";
        stopReason = "completed";
        break;
      }

      if (totalInputTokens + totalOutputTokens > limits.maxTotalTokens) {
        finalText = step.text;
        status = "stopped_limit";
        stopReason = "max_tokens";
        break;
      }

      for (const call of step.toolCalls) {
        const outcome = await input
          .executeTool(call)
          .catch((err): { error: string } => ({ error: err instanceof Error ? err.message : String(err) }));

        let resultText: string;
        if (Array.isArray(outcome)) {
          allEvidence.push(...outcome);
          resultText = outcome.length
            ? JSON.stringify(
                outcome.map((item) => ({
                  ref: allEvidence.indexOf(item) + 1,
                  kind: item.kind,
                  label: item.label,
                  detail: item.detail,
                  link: item.link,
                })),
              )
            : JSON.stringify({ note: "No matching records found for this search." });
        } else {
          resultText = JSON.stringify(outcome);
        }

        await database.insert(agentSteps).values({
          runId,
          stepNumber,
          role: "tool",
          content: resultText,
          toolName: call.name,
          toolCallId: call.id,
        });
        turns.push({ role: "tool", toolCallId: call.id, name: call.name, content: resultText });
      }

      if (stepNumber >= limits.maxSteps) {
        status = "stopped_limit";
        stopReason = "max_steps";
        break stepLoop;
      }
    }
  } catch (err) {
    status = "failed";
    stopReason = "error";
    console.error("agent runner:", err instanceof AiUnavailableError ? err.failures.join(" | ") : err);
  }

  if (!finalText) {
    finalText =
      status === "completed"
        ? ""
        : `Stopped after ${stepNumber} step(s) (${stopReason.replace("_", " ")}) before producing a final answer.`;
  }

  await database
    .update(agentRuns)
    .set({ status, stopReason, totalSteps: stepNumber, totalInputTokens, totalOutputTokens, completedAt: new Date() })
    .where(eq(agentRuns.id, runId));

  return { runId, status, stopReason, finalText, evidence: allEvidence, steps: stepNumber };
}
