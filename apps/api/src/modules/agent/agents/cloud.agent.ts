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

/// Cloud Agent — AWS/Azure/GCP misconfiguration and IAM analysis: public
/// storage buckets, overly permissive IAM policies, exposed management
/// interfaces, metadata-service SSRF exposure, insecure serverless
/// configuration.
@Injectable()
export class CloudAgent extends PromptDrivenAgent {
  readonly type = 'CLOUD' as const;
  readonly displayName = 'Cloud Agent';
  readonly description =
    'Analyzes cloud infrastructure attack surface: IAM misconfiguration, public storage exposure, and metadata-service risks.';
  readonly allowedTools: readonly AiToolName[] = [
    'search_findings',
    'search_recon_data',
    'search_targets',
    'create_note',
    // Module 11 — Autonomous Vulnerability Analysis (task #228): NUCLEI
    // ships cloud-misconfiguration templates, so this agent may also
    // trigger a scan, not only read existing findings.
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
    return `You are the Cloud Agent in an autonomous penetration-testing multi-agent system, specializing in cloud infrastructure security (AWS/Azure/GCP: IAM over-permissioning, public storage buckets, exposed management interfaces, instance-metadata-service SSRF exposure, insecure serverless/IaC configuration). Respond with ONLY a single JSON object: { "likelyMisconfigurations": [{ "class": string, "resourceType": string, "rationale": string, "severity": "INFO"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL" }], "suggestedChecks": string[], "reasoningSummary": string, "confidence": number }.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `Cloud analysis task: ${input.title}\nInput: ${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
  }

  protected parseCompletion(text: string, input: AgentExecutionInput): AgentPromptOutcome {
    const parsed = extractAgentJson<{
      likelyMisconfigurations?: unknown[];
      suggestedChecks?: unknown[];
      reasoningSummary?: unknown;
      confidence?: unknown;
    }>(text);

    return {
      output: {
        likelyMisconfigurations: Array.isArray(parsed?.likelyMisconfigurations)
          ? parsed!.likelyMisconfigurations
          : [],
        suggestedChecks: Array.isArray(parsed?.suggestedChecks)
          ? parsed!.suggestedChecks.filter((s): s is string => typeof s === 'string')
          : [],
      },
      reasoningSummary:
        typeof parsed?.reasoningSummary === 'string'
          ? parsed!.reasoningSummary
          : `Assessed cloud infrastructure attack surface for: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
