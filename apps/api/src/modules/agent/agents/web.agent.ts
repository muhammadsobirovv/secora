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

/// Web Agent — application-layer analysis: OWASP-class web vulnerabilities
/// (injection, auth, access control, XSS, SSRF, deserialization, etc.)
/// against the target/finding context it's given.
@Injectable()
export class WebAgent extends PromptDrivenAgent {
  readonly type = 'WEB' as const;
  readonly displayName = 'Web Agent';
  readonly description =
    'Analyzes web application attack surface: identifies likely vulnerability classes and suggests targeted test payloads.';
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
    return `You are the Web Agent in an autonomous penetration-testing multi-agent system, specializing in web application security (OWASP Top 10 and beyond: injection, broken auth, broken access control, XSS, SSRF, insecure deserialization, security misconfiguration). Respond with ONLY a single JSON object: { "likelyVulnerabilities": [{ "class": string, "location": string, "rationale": string, "severity": "INFO"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL" }], "suggestedTests": [{ "description": string, "payloadCategory": string }], "reasoningSummary": string, "confidence": number }.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `Web analysis task: ${input.title}\nInput: ${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
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
          : `Assessed web application attack surface for: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
