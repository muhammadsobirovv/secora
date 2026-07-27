import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiToolName } from '@pentesthub/shared';
import type { EnvConfig } from '../../../config/env.validation.js';
import { AiProviderRegistryService } from '../../ai/providers/ai-provider-registry.service.js';
import { AiToolRegistryService } from '../../ai/tools/ai-tool-registry.service.js';
import { PromptInjectionGuardService } from '../../ai/security/prompt-injection-guard.service.js';
import type { AgentExecutionInput } from './base-agent.js';
import type { AgentPromptOutcome } from './prompt-driven-agent.base.js';
import { PromptDrivenAgent, clampConfidence, extractAgentJson } from './prompt-driven-agent.base.js';

/// Risk Assessment Agent — Autonomous Vulnerability Analysis's
/// prioritization half: given one or more findings (possibly already
/// clustered by AiVulnerabilityAnalysisService, task #228), estimates
/// business impact and produces a priority ranking, independent of raw
/// CVSS (a CRITICAL CVSS finding on an unreachable internal-only asset may
/// rank below a MEDIUM finding on the public login page).
@Injectable()
export class RiskAssessmentAgent extends PromptDrivenAgent {
  readonly type = 'RISK_ASSESSMENT' as const;
  readonly displayName = 'Risk Assessment Agent';
  readonly description =
    'Estimates business impact and produces a priority ranking across findings, beyond raw CVSS score.';
  readonly allowedTools: readonly AiToolName[] = ['search_findings', 'search_evidence'];

  constructor(
    providerRegistry: AiProviderRegistryService,
    configService: ConfigService<EnvConfig, true>,
    toolRegistry: AiToolRegistryService,
    injectionGuard: PromptInjectionGuardService,
  ) {
    super(providerRegistry, configService, toolRegistry, injectionGuard);
  }

  protected buildSystemPrompt(): string {
    return `You are the Risk Assessment Agent in an autonomous penetration-testing multi-agent system. Given one or more findings, respond with ONLY a single JSON object: { "assessments": [{ "findingRef": string, "businessImpact": string, "priorityRank": number, "riskRating": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "rationale": string }], "reasoningSummary": string, "confidence": number }. "priorityRank" is 1 = highest priority, ties allowed only when genuinely equal. Base "riskRating" on realistic business impact and exploitability together, not raw CVSS alone — a technically severe finding on an unreachable/low-value asset can rank lower than a technically moderate finding on a high-value, publicly reachable asset.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `Risk assessment task: ${input.title}\nFindings: ${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
  }

  protected temperature(): number {
    return 0.2;
  }

  protected parseCompletion(text: string, input: AgentExecutionInput): AgentPromptOutcome {
    const parsed = extractAgentJson<{
      assessments?: unknown[];
      reasoningSummary?: unknown;
      confidence?: unknown;
    }>(text);

    return {
      output: {
        assessments: Array.isArray(parsed?.assessments) ? parsed!.assessments : [],
      },
      reasoningSummary:
        typeof parsed?.reasoningSummary === 'string'
          ? parsed!.reasoningSummary
          : `Assessed risk/priority for: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
