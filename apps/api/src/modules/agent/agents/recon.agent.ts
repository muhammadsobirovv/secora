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

/// Autonomous Recon: "create recon plans, run recon tools, interpret
/// results, identify interesting assets, prioritize attack surface,
/// suggest next steps." This agent can call search_recon_data/
/// search_targets/search_projects mid-turn (AI Tool Calling, via
/// PromptDrivenAgent's tool loop) to ground its plan in what's actually
/// been found so far; it doesn't launch Recon Engine jobs itself yet —
/// that hook lives in the Autonomous Recon integration (task #228), which
/// calls the same Recon Engine command layer a human user's "Run Scan"
/// button does.
@Injectable()
export class ReconAgent extends PromptDrivenAgent {
  readonly type = 'RECON' as const;
  readonly displayName = 'Recon Agent';
  readonly description =
    'Plans and interprets reconnaissance: identifies interesting assets, prioritizes attack surface, and suggests next recon steps.';
  readonly allowedTools: readonly AiToolName[] = [
    'search_recon_data',
    'search_targets',
    'search_projects',
    'create_note',
    // Module 11 — Autonomous Reconnaissance (task #228): the RECON agent
    // is the one specialist allowed to actually start a new scan, not
    // just read prior results.
    'start_recon_scan',
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
    return `You are the Recon Agent in an autonomous penetration-testing multi-agent system. Given a reconnaissance goal and whatever recon data/context is available, respond with ONLY a single JSON object: { "plan": [{ "step": string, "tool": string|null, "rationale": string }], "interestingAssets": [{ "asset": string, "why": string, "priority": "LOW"|"MEDIUM"|"HIGH" }], "nextSteps": string[], "reasoningSummary": string, "confidence": number }. "plan" is an ordered recon plan (subdomain enumeration, crawling, historical URLs, WHOIS/ASN, etc. as applicable). "confidence" is 0.0-1.0, how confident you are this plan/prioritization is sound given the available context.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `Recon goal: ${input.title}\nInput: ${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
  }

  protected parseCompletion(text: string, input: AgentExecutionInput): AgentPromptOutcome {
    const parsed = extractAgentJson<{
      plan?: unknown[];
      interestingAssets?: unknown[];
      nextSteps?: unknown[];
      reasoningSummary?: unknown;
      confidence?: unknown;
    }>(text);

    return {
      output: {
        plan: Array.isArray(parsed?.plan) ? parsed!.plan : [],
        interestingAssets: Array.isArray(parsed?.interestingAssets)
          ? parsed!.interestingAssets
          : [],
        nextSteps: Array.isArray(parsed?.nextSteps)
          ? parsed!.nextSteps.filter((s): s is string => typeof s === 'string')
          : [],
      },
      reasoningSummary:
        typeof parsed?.reasoningSummary === 'string'
          ? parsed!.reasoningSummary
          : `Proposed a reconnaissance plan for: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
