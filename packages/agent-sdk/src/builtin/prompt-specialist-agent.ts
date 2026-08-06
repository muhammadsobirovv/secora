import { buildMcpResourceUri, type McpResourceType } from '@pentesthub/shared';
import type { AgentLifecycle, AgentLifecycleContext } from '../lifecycle.js';

/// Module 13 — built-in agents (task #282) share one generic
/// implementation rather than eleven near-duplicate classes: each is
/// "load one resource type for background, then ask the platform's own
/// `ask_ai` MCP tool a specialty-framed question" — exactly the
/// Initialize/LoadContext/ReceiveTask/CallTools/GenerateResult/Shutdown
/// lifecycle the SDK defines, demonstrated at reference depth (a single
/// AI completion, not Module 11's multi-turn tool-calling loop — that
/// deeper orchestrator-owned system is unchanged by this module; see
/// `BUILTIN_AGENT_SLUGS`'s doc comment in `@pentesthub/shared` for the
/// full disclosure of what's reused vs. net-new).
export interface PromptSpecialistConfig {
  slug: string;
  displayName: string;
  description: string;
  /// Prepended to every task as the model's framing — this is the
  /// entirety of each built-in agent's "specialty".
  systemPrompt: string;
  /// Read once in `loadContext`, best-effort (a failure here doesn't
  /// fail the run — the agent just proceeds without background).
  contextResourceType?: McpResourceType;
}

function summarizeContext(data: unknown): string {
  const text = JSON.stringify(data);
  return text.length > 4000 ? `${text.slice(0, 4000)}…(truncated)` : text;
}

export function createPromptSpecialistAgent(config: PromptSpecialistConfig): AgentLifecycle {
  return {
    slug: config.slug,
    displayName: config.displayName,
    description: config.description,

    async loadContext(ctx: AgentLifecycleContext) {
      if (!config.contextResourceType) return;
      try {
        const uri = buildMcpResourceUri(ctx.workspaceId, config.contextResourceType);
        ctx.state.backgroundContext = await ctx.readResource(uri);
      } catch {
        // Best-effort — see class doc comment.
      }
    },

    async generateResult(ctx: AgentLifecycleContext) {
      const task =
        typeof ctx.input?.task === 'string'
          ? ctx.input.task
          : typeof ctx.input?.question === 'string'
            ? ctx.input.question
            : JSON.stringify(ctx.input ?? {});
      const background = ctx.state.backgroundContext
        ? `\n\nRelevant platform data (${config.contextResourceType}):\n${summarizeContext(ctx.state.backgroundContext)}`
        : '';

      const result = await ctx.callTool('ask_ai', {
        workspaceId: ctx.workspaceId,
        question: `${config.systemPrompt}\n\nTask: ${task}${background}`,
      });

      const rawText = result.content[0]?.text ?? '';
      let answer = rawText;
      if (!result.isError) {
        try {
          const parsed = JSON.parse(rawText) as { answer?: string };
          if (typeof parsed.answer === 'string') answer = parsed.answer;
        } catch {
          // Non-JSON payload (shouldn't happen for ask_ai, but don't
          // crash the agent over it) — fall back to the raw text.
        }
      }

      ctx.publishEvent({ summary: `${config.displayName} produced a response`, length: answer.length });
      if (result.isError) {
        return { answer: null, error: answer };
      }
      return { answer };
    },
  };
}
