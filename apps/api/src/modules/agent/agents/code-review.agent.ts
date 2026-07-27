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

/// Code Review Agent — static/source-level security review of code
/// snippets or diffs surfaced during an engagement (e.g. from a source-
/// available target, a client-provided repo excerpt, or decompiled
/// mobile/API client code another agent pulled in).
@Injectable()
export class CodeReviewAgent extends PromptDrivenAgent {
  readonly type = 'CODE_REVIEW' as const;
  readonly displayName = 'Code Review Agent';
  readonly description =
    'Performs security-focused static review of source code or diffs: flags vulnerable patterns with file/line-level rationale.';
  readonly allowedTools: readonly AiToolName[] = [
    'search_findings',
    'generate_poc',
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
    return `You are the Code Review Agent in an autonomous penetration-testing multi-agent system, performing a security-focused static code review. Respond with ONLY a single JSON object: { "findings": [{ "issue": string, "location": string, "cweId": string|null, "severity": "INFO"|"LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "recommendation": string }], "overallAssessment": string, "reasoningSummary": string, "confidence": number }. "location" should reference the file/function/line if identifiable from the input, otherwise describe the code block. Only flag genuine security-relevant issues, not general style/quality nits.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `Code review task: ${input.title}\nCode/diff:\n${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
  }

  protected temperature(): number {
    return 0.15;
  }

  protected parseCompletion(text: string, input: AgentExecutionInput): AgentPromptOutcome {
    const parsed = extractAgentJson<{
      findings?: unknown[];
      overallAssessment?: unknown;
      reasoningSummary?: unknown;
      confidence?: unknown;
    }>(text);

    return {
      output: {
        findings: Array.isArray(parsed?.findings) ? parsed!.findings : [],
        overallAssessment:
          typeof parsed?.overallAssessment === 'string' ? parsed!.overallAssessment : '',
      },
      reasoningSummary:
        typeof parsed?.reasoningSummary === 'string'
          ? parsed!.reasoningSummary
          : `Reviewed code for: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
