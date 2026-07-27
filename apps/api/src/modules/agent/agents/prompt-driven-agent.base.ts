import type { ConfigService } from '@nestjs/config';
import type { AgentTaskSourceRef, AiProviderName, AiToolName } from '@pentesthub/shared';
import { AI_PROVIDER_NAMES } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiProviderRegistryService } from '../../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../../ai/providers/collect-stream.util.js';
import type { AiChatMessage } from '../../ai/providers/ai-provider.interface.js';
import { AiToolRegistryService } from '../../ai/tools/ai-tool-registry.service.js';
import { findToolCall } from '../../ai/tools/tool-call-parser.util.js';
import { PromptInjectionGuardService } from '../../ai/security/prompt-injection-guard.service.js';
import {
  AI_SECURITY_GUARDRAILS_PROMPT,
  renderAvailableToolsPrompt,
} from '../../ai/prompts/security.prompts.js';
import type {
  AgentExecutionInput,
  AgentExecutionResult,
  AgentToolCallRecord,
} from './base-agent.js';
import { BaseAgent } from './base-agent.js';

/// Task #224's budget — mirrors AiChatService's MAX_TOOL_CALLS_PER_TURN,
/// scoped per-agent-task rather than per-chat-turn.
const MAX_AGENT_TOOL_CALLS = 3;

function isValidProviderName(value: string | undefined): value is AiProviderName {
  return !!value && (AI_PROVIDER_NAMES as string[]).includes(value);
}

/// Same defensive-JSON convention as BugBountyAiAssistantService and the
/// wider AI module: a model that ignores "respond with ONLY JSON"
/// degrades to a best-effort fallback, never a thrown error — an agent
/// task failing outright over a formatting slip would be a bad trade
/// against Reasoning Engine's "Error recovery" goal.
export function extractAgentJson<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

/// A model that skips the confidence field, or returns nonsense, degrades
/// to a neutral 0.5 rather than 0 (which would misleadingly read as "the
/// agent is certain this is wrong") or 1 (overclaiming certainty).
export function clampConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

/// What a concrete agent hands back to PromptDrivenAgent after the model's
/// *final* (non-tool-call) response — everything AgentExecutionResult
/// needs except `toolCalls`, which this base class fills in itself from
/// whatever tool round-trips happened along the way.
export interface AgentPromptOutcome {
  output: Record<string, unknown>;
  reasoningSummary: string;
  confidenceScore: number;
  sources: AgentTaskSourceRef[];
}

/// Shared execution engine for every agent (all twelve, today): resolves a
/// provider, runs the AI Tool Calling loop (Task #224 — reusing the exact
/// same AiToolRegistryService/tool-call-tag protocol AiChatService already
/// uses, just looped per-agent-task instead of per-chat-turn), enforces
/// each agent's `allowedTools` permission list, and hands the model's
/// final response to the subclass's `parseCompletion`.
export abstract class PromptDrivenAgent extends BaseAgent {
  constructor(
    protected readonly providerRegistry: AiProviderRegistryService,
    protected readonly configService: ConfigService<EnvConfig, true>,
    protected readonly toolRegistry: AiToolRegistryService,
    protected readonly injectionGuard: PromptInjectionGuardService,
  ) {
    super();
  }

  /// Subclasses describe their specialty here: the system prompt (who this
  /// agent is, what JSON shape to respond with), the user prompt (this
  /// task's instruction + input + upstream context folded in), and how to
  /// turn the model's raw text back into structured output.
  protected abstract buildSystemPrompt(input: AgentExecutionInput): string;
  protected abstract buildUserPrompt(input: AgentExecutionInput): string;
  protected abstract parseCompletion(
    text: string,
    input: AgentExecutionInput,
  ): AgentPromptOutcome;
  protected temperature(): number {
    return 0.3;
  }

  async execute(
    input: AgentExecutionInput,
    signal: AbortSignal,
  ): Promise<AgentExecutionResult> {
    const preferred = isValidProviderName(input.provider) ? input.provider : null;
    const { provider, credential } = await this.providerRegistry.resolveProvider(
      input.workspaceId,
      preferred,
    );
    const model = input.model ?? provider.getDefaultModel(credential);
    const maxTokens = this.configService.get('AI_CHAT_STREAM_MAX_TOKENS', {
      infer: true,
    });

    const systemPrompt = [
      this.buildSystemPrompt(input),
      AI_SECURITY_GUARDRAILS_PROMPT,
      this.allowedTools.length > 0
        ? renderAvailableToolsPrompt(this.allowedTools)
        : null,
    ]
      .filter((s): s is string => !!s)
      .join('\n\n');

    const messages: AiChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this.buildUserPrompt(input) },
    ];

    const toolCalls: AgentToolCallRecord[] = [];
    let text = '';

    for (let round = 0; round <= MAX_AGENT_TOOL_CALLS; round += 1) {
      text = await collectStreamedCompletion(
        provider,
        { model, maxTokens, temperature: this.temperature(), signal, messages },
        credential,
      );

      if (round === MAX_AGENT_TOOL_CALLS) break;

      const toolCall = findToolCall(text);
      if (!toolCall) break;

      messages.push({ role: 'assistant', content: toolCall.raw });

      const startedAt = Date.now();
      let output: Record<string, unknown> | null = null;
      let errorMessage: string | null = null;

      if (!this.allowedTools.includes(toolCall.name as AiToolName)) {
        // Tool Permissions — reject before ever reaching
        // AiToolRegistryService, and tell the model so it can adjust
        // rather than silently getting nothing back.
        errorMessage = `Tool "${toolCall.name}" is not permitted for the ${this.type} agent.`;
        output = { error: errorMessage };
      } else {
        const tool = this.toolRegistry.get(toolCall.name);
        if (!tool) {
          errorMessage = `Unknown tool "${toolCall.name}"`;
          output = { error: errorMessage };
        } else {
          try {
            output = await tool.execute(toolCall.input, {
              workspaceId: input.workspaceId,
              projectId: input.projectId ?? '',
              userId: input.userId,
            });
          } catch (error) {
            errorMessage =
              error instanceof Error ? error.message : 'Tool execution failed';
            output = { error: errorMessage };
          }
        }
      }

      toolCalls.push({
        toolName: toolCall.name,
        input: toolCall.input,
        output,
        errorMessage,
        durationMs: Date.now() - startedAt,
      });

      messages.push({
        role: 'user',
        content: this.injectionGuard.wrapAsData(
          `tool result: ${toolCall.name}`,
          JSON.stringify(output),
        ),
      });
    }

    const outcome = this.parseCompletion(text, input);
    return { ...outcome, toolCalls };
  }

  /// Common upstream-context formatter every agent's buildUserPrompt can
  /// reuse — renders prior tasks' outputs as short labeled blocks so a
  /// downstream agent (e.g. Report Writer reading Web + API agent output)
  /// has real context instead of starting from nothing.
  protected formatUpstreamContext(input: AgentExecutionInput): string {
    if (input.upstreamContext.length === 0) return '';
    const blocks = input.upstreamContext.map((u) => {
      const body = u.output ? JSON.stringify(u.output) : '(no output)';
      return `[${u.agentType}] ${u.title}\n${body}`;
    });
    return `\n\nContext from earlier steps in this run:\n${blocks.join('\n\n')}`;
  }

  protected formatTaskInput(input: AgentExecutionInput): string {
    return input.input ? JSON.stringify(input.input) : '(no additional input)';
  }
}
