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

/// Active Directory Agent — internal Windows domain attack paths:
/// Kerberoasting, AS-REP roasting, ACL abuse, delegation misconfiguration,
/// credential exposure (GPP/SYSVOL/LAPS), lateral movement chains.
@Injectable()
export class ActiveDirectoryAgent extends PromptDrivenAgent {
  readonly type = 'ACTIVE_DIRECTORY' as const;
  readonly displayName = 'Active Directory Agent';
  readonly description =
    'Analyzes internal Windows/AD attack paths: Kerberoasting, ACL abuse, delegation misconfiguration, and lateral movement chains.';
  readonly allowedTools: readonly AiToolName[] = [
    'search_findings',
    'search_recon_data',
    'generate_payloads',
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
    return `You are the Active Directory Agent in an autonomous penetration-testing multi-agent system, specializing in internal Windows domain attack paths (Kerberoasting, AS-REP roasting, ACL/ACE abuse, unconstrained/constrained delegation, GPP/SYSVOL/LAPS credential exposure, lateral movement and privilege escalation chains toward Domain Admin). Respond with ONLY a single JSON object: { "attackPaths": [{ "technique": string, "prerequisite": string, "rationale": string, "severity": "INFO"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL" }], "suggestedChecks": string[], "reasoningSummary": string, "confidence": number }.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `Active Directory analysis task: ${input.title}\nInput: ${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
  }

  protected parseCompletion(text: string, input: AgentExecutionInput): AgentPromptOutcome {
    const parsed = extractAgentJson<{
      attackPaths?: unknown[];
      suggestedChecks?: unknown[];
      reasoningSummary?: unknown;
      confidence?: unknown;
    }>(text);

    return {
      output: {
        attackPaths: Array.isArray(parsed?.attackPaths) ? parsed!.attackPaths : [],
        suggestedChecks: Array.isArray(parsed?.suggestedChecks)
          ? parsed!.suggestedChecks.filter((s): s is string => typeof s === 'string')
          : [],
      },
      reasoningSummary:
        typeof parsed?.reasoningSummary === 'string'
          ? parsed!.reasoningSummary
          : `Assessed Active Directory attack paths for: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
