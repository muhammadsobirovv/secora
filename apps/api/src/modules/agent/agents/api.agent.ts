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

/// API Agent — REST/GraphQL/gRPC API security: BOLA/IDOR, broken function-
/// level authorization, mass assignment, rate-limiting gaps, schema
/// exposure (OWASP API Security Top 10).
@Injectable()
export class ApiAgent extends PromptDrivenAgent {
  readonly type = 'API' as const;
  readonly displayName = 'API Agent';
  readonly description =
    'Analyzes REST/GraphQL API attack surface: authorization, object-level access, rate limiting, and schema exposure risks.';
  readonly allowedTools: readonly AiToolName[] = [
    'search_findings',
    'search_recon_data',
    'generate_poc',
    'generate_payloads',
    'create_note',
    // Module 11 — Autonomous Vulnerability Analysis (task #228).
    'start_vulnerability_scan',
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
    return `You are the API Agent in an autonomous penetration-testing multi-agent system, specializing in API security (OWASP API Security Top 10: BOLA/IDOR, broken authentication, broken object property level authorization, unrestricted resource consumption, broken function level authorization, mass assignment, security misconfiguration, improper inventory management). Respond with ONLY a single JSON object: { "likelyVulnerabilities": [{ "class": string, "endpoint": string, "rationale": string, "severity": "INFO"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL" }], "suggestedTests": [{ "description": string, "payloadCategory": string }], "reasoningSummary": string, "confidence": number }.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `API analysis task: ${input.title}\nInput: ${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
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
          : `Assessed API attack surface for: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
