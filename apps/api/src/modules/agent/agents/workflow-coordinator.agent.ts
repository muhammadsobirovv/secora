import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentType, AiToolName } from '@pentesthub/shared';
import { AGENT_TYPES } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiProviderRegistryService } from '../../ai/providers/ai-provider-registry.service.js';
import { AiToolRegistryService } from '../../ai/tools/ai-tool-registry.service.js';
import { PromptInjectionGuardService } from '../../ai/security/prompt-injection-guard.service.js';
import type { AgentExecutionInput } from './base-agent.js';
import type { AgentPromptOutcome } from './prompt-driven-agent.base.js';
import { PromptDrivenAgent, clampConfidence, extractAgentJson } from './prompt-driven-agent.base.js';

/// Workflow Coordinator Agent — Task Delegation at the sub-task level.
/// While the Master AI Orchestrator (task #223) does the *top-level*
/// goal-to-plan decomposition, a single AgentTask can turn out to be
/// bigger than one specialist agent should handle in one shot; assigning
/// it to the Workflow Coordinator instead lets it propose a breakdown into
/// child AgentTasks (each assigned to whichever specialist fits), which
/// AgentOrchestratorService creates as `parentTaskId`-linked AgentTask
/// rows (Support delegation, Task Decomposition).
@Injectable()
export class WorkflowCoordinatorAgent extends PromptDrivenAgent {
  readonly type = 'WORKFLOW_COORDINATOR' as const;
  readonly displayName = 'Workflow Coordinator Agent';
  readonly description =
    'Breaks a broad task down into smaller sub-tasks and assigns each to the specialist agent best suited to it.';
  readonly allowedTools: readonly AiToolName[] = [
    'search_projects',
    'search_targets',
    'create_note',
  ];

  constructor(
    providerRegistry: AiProviderRegistryService,
    configService: ConfigService<EnvConfig, true>,
    toolRegistry: AiToolRegistryService,
    injectionGuard: PromptInjectionGuardService,
  ) {
    super(providerRegistry, configService, toolRegistry, injectionGuard);
  }

  protected buildSystemPrompt(): string {
    return `You are the Workflow Coordinator Agent in an autonomous penetration-testing multi-agent system. The available specialist agent types are: ${AGENT_TYPES.join(', ')}. Given a task that may be too broad for one specialist, respond with ONLY a single JSON object: { "shouldDelegate": boolean, "subTasks": [{ "agentType": string, "title": string, "rationale": string }], "reasoningSummary": string, "confidence": number }. Set "shouldDelegate" false and an empty "subTasks" array if this task is actually narrow enough for a single agent already handling it — only propose a breakdown when it genuinely helps. Never propose "agentType": "WORKFLOW_COORDINATOR" as a sub-task (it would recurse); each sub-task must go to one of the other specialist types.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `Coordination task: ${input.title}\nInput: ${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
  }

  protected parseCompletion(text: string, input: AgentExecutionInput): AgentPromptOutcome {
    const parsed = extractAgentJson<{
      shouldDelegate?: unknown;
      subTasks?: unknown[];
      reasoningSummary?: unknown;
      confidence?: unknown;
    }>(text);

    const validAgentTypes = new Set<string>(
      AGENT_TYPES.filter((t: AgentType) => t !== 'WORKFLOW_COORDINATOR'),
    );
    const subTasks = Array.isArray(parsed?.subTasks)
      ? parsed!.subTasks.filter(
          (
            s,
          ): s is { agentType: string; title: string; rationale: string } =>
            typeof s === 'object' &&
            s !== null &&
            typeof (s as Record<string, unknown>).agentType === 'string' &&
            validAgentTypes.has((s as Record<string, unknown>).agentType as string) &&
            typeof (s as Record<string, unknown>).title === 'string',
        )
      : [];

    return {
      output: {
        shouldDelegate: parsed?.shouldDelegate === true && subTasks.length > 0,
        subTasks,
      },
      reasoningSummary:
        typeof parsed?.reasoningSummary === 'string'
          ? parsed!.reasoningSummary
          : `Evaluated whether to delegate: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
