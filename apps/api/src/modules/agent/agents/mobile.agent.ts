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

/// Mobile Agent — Android/iOS application security (OWASP Mobile Top 10:
/// insecure data storage, insecure communication, insecure auth, client
/// code quality, reverse-engineering exposure, insufficient
/// cryptography).
@Injectable()
export class MobileAgent extends PromptDrivenAgent {
  readonly type = 'MOBILE' as const;
  readonly displayName = 'Mobile Agent';
  readonly description =
    'Analyzes Android/iOS application attack surface: insecure storage, weak transport security, and client-side exposure.';
  readonly allowedTools: readonly AiToolName[] = [
    'search_findings',
    'generate_poc',
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
    return `You are the Mobile Agent in an autonomous penetration-testing multi-agent system, specializing in mobile application security (OWASP Mobile Top 10: insecure data storage, insecure communication, insecure authentication/authorization, insufficient cryptography, client code quality, reverse-engineering/tampering exposure). Respond with ONLY a single JSON object: { "likelyVulnerabilities": [{ "class": string, "platform": "ANDROID"|"IOS"|"BOTH", "rationale": string, "severity": "INFO"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL" }], "suggestedTests": [{ "description": string, "tooling": string }], "reasoningSummary": string, "confidence": number }.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `Mobile analysis task: ${input.title}\nInput: ${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
  }

  protected parseCompletion(text: string, input: AgentExecutionInput): AgentPromptOutcome {
    const parsed = extractAgentJson<{
      likelyVulnerabilities?: unknown[];
      suggestedTests?: unknown[];
      reasoningSummary?: unknown;
      confidence?: unknown;
    }>(text);

    return {
      output: {
        likelyVulnerabilities: Array.isArray(parsed?.likelyVulnerabilities)
          ? parsed!.likelyVulnerabilities
          : [],
        suggestedTests: Array.isArray(parsed?.suggestedTests) ? parsed!.suggestedTests : [],
      },
      reasoningSummary:
        typeof parsed?.reasoningSummary === 'string'
          ? parsed!.reasoningSummary
          : `Assessed mobile application attack surface for: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
