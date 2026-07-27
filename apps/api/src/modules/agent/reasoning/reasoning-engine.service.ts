import { Injectable, Logger } from '@nestjs/common';
import type { AiProviderName } from '@pentesthub/shared';
import { AI_PROVIDER_NAMES } from '@pentesthub/shared';
import { AiProviderRegistryService } from '../../ai/providers/ai-provider-registry.service.js';
import { collectStreamedCompletion } from '../../ai/providers/collect-stream.util.js';
import { extractAgentJson } from '../agents/prompt-driven-agent.base.js';

function isValidProviderName(value: string | undefined): value is AiProviderName {
  return !!value && (AI_PROVIDER_NAMES as string[]).includes(value);
}

export interface SelfEvaluationInput {
  workspaceId: string;
  goal: string;
  /// The orchestrator's own per-task-averaged confidence, computed purely
  /// from each agent's self-reported score — this method's job is to
  /// *check* that number against the actual result text, not replace it
  /// blindly.
  taskSummaryLines: string[];
  averageTaskConfidence: number | null;
  provider?: string;
  model?: string;
}

export interface SelfEvaluationResult {
  /// Best-effort *revised* confidence for the run as a whole — may differ
  /// from `averageTaskConfidence` if the critique pass spots a mismatch
  /// (e.g. every task "succeeded" but the outputs don't actually answer
  /// the goal). Null only when neither the per-task average nor the
  /// critique pass produced anything usable.
  confidenceScore: number | null;
  /// A short human-readable critique — Explainability's "does this result
  /// actually satisfy the goal" narrative, distinct from any individual
  /// agent's own reasoningSummary.
  critique: string;
  /// Concrete next actions a human (or a follow-up OrchestrationRun)
  /// could take — Reasoning Engine's error-recovery / gap-filling output.
  recommendedFollowUps: string[];
}

/// The Reasoning Engine's Self-Evaluation stage (task #226). Planning +
/// Task Decomposition already live in AgentOrchestratorService.planGoal()
/// (kept there rather than moved here, since it's tightly coupled to
/// OrchestrationPlanDto/PlanStep construction and moving it would be a
/// pure refactor with no behavior change — not worth the regression risk
/// in a sandbox where this file can't be live-typechecked). This service
/// covers the complementary half: after a run's tasks finish, take a step
/// back and critique the aggregate result before it's reported as done.
/// Same "best-effort, never blocks the caller" shape as
/// AiMemoryService.summarizeResults — a misconfigured/unreachable
/// provider degrades to the orchestrator's own pre-computed average
/// rather than failing the run.
@Injectable()
export class ReasoningEngineService {
  private readonly logger = new Logger(ReasoningEngineService.name);

  constructor(private readonly providerRegistry: AiProviderRegistryService) {}

  async selfEvaluate(input: SelfEvaluationInput): Promise<SelfEvaluationResult> {
    const fallback: SelfEvaluationResult = {
      confidenceScore: input.averageTaskConfidence,
      critique: '',
      recommendedFollowUps: [],
    };
    if (input.taskSummaryLines.length === 0) return fallback;

    try {
      const preferred = isValidProviderName(input.provider) ? input.provider : null;
      const { provider, credential } = await this.providerRegistry.resolveProvider(
        input.workspaceId,
        preferred,
      );
      const model = input.model ?? provider.getDefaultModel(credential);

      const systemPrompt =
        'You are the self-evaluation stage of an autonomous penetration-testing orchestrator. You are given the original goal and a list of completed/failed sub-task summaries. Critically assess whether the sub-task outputs, taken together, actually satisfy the goal — do not simply trust that "completed" status means the goal was met. Respond with ONLY a single JSON object: { "confidenceScore": number (0..1, your own independent estimate that the goal was satisfied), "critique": string (2-4 sentences, name specific gaps if any), "recommendedFollowUps": string[] (concrete next steps; empty array if none needed) }.';
      const userPrompt = `Goal: ${input.goal}\n\nSub-task results:\n${input.taskSummaryLines.join('\n')}`;

      const text = await collectStreamedCompletion(
        provider,
        {
          model,
          maxTokens: 512,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        },
        credential,
      );

      const parsed = extractAgentJson<{
        confidenceScore?: unknown;
        critique?: unknown;
        recommendedFollowUps?: unknown[];
      }>(text);
      if (!parsed) return fallback;

      const rawConfidence =
        typeof parsed.confidenceScore === 'number' ? parsed.confidenceScore : null;
      const confidenceScore =
        rawConfidence !== null
          ? Math.max(0, Math.min(1, rawConfidence))
          : input.averageTaskConfidence;

      return {
        confidenceScore,
        critique: typeof parsed.critique === 'string' ? parsed.critique : '',
        recommendedFollowUps: Array.isArray(parsed.recommendedFollowUps)
          ? parsed.recommendedFollowUps.filter((f): f is string => typeof f === 'string')
          : [],
      };
    } catch (error) {
      this.logger.warn(`Self-evaluation fell back to task-average confidence: ${String(error)}`);
      return fallback;
    }
  }
}
