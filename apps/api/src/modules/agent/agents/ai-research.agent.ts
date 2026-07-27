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

/// AI Research Agent — the orchestrator's research arm: given an open
/// question (a technique, a CVE, an unfamiliar framework/protocol), pulls
/// together what's known from the workspace's own knowledge (via
/// search_notes/search_templates/search_evidence, callable mid-turn
/// through PromptDrivenAgent's tool loop) and the model's own training
/// knowledge, and reports back a synthesized answer other agents/the
/// orchestrator can act on.
@Injectable()
export class AiResearchAgent extends PromptDrivenAgent {
  readonly type = 'AI_RESEARCH' as const;
  readonly displayName = 'AI Research Agent';
  readonly description =
    'Researches an open technical question (technique, CVE, framework) and synthesizes an actionable answer for other agents.';
  readonly allowedTools: readonly AiToolName[] = [
    'search_findings',
    'search_notes',
    'search_templates',
    'search_evidence',
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
    return `You are the AI Research Agent in an autonomous penetration-testing multi-agent system. Given a research question (a technique, CVE, protocol, or framework another agent needs to understand), respond with ONLY a single JSON object: { "answer": string, "keyFacts": string[], "relevantReferences": [{ "framework": string, "code": string, "note": string }], "caveats": string[], "reasoningSummary": string, "confidence": number }. "relevantReferences" should cite known frameworks/codes (OWASP/CWE/CAPEC/MITRE ATT&CK/NIST/CVE) when applicable, empty array if none apply. "caveats" flags anything you're uncertain about or that needs verification against the live target.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `Research question: ${input.title}\nInput: ${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
  }

  protected parseCompletion(text: string, input: AgentExecutionInput): AgentPromptOutcome {
    const parsed = extractAgentJson<{
      answer?: unknown;
      keyFacts?: unknown[];
      relevantReferences?: unknown[];
      caveats?: unknown[];
      reasoningSummary?: unknown;
      confidence?: unknown;
    }>(text);

    return {
      output: {
        answer: typeof parsed?.answer === 'string' ? parsed!.answer : text.trim(),
        keyFacts: Array.isArray(parsed?.keyFacts)
          ? parsed!.keyFacts.filter((s): s is string => typeof s === 'string')
          : [],
        relevantReferences: Array.isArray(parsed?.relevantReferences)
          ? parsed!.relevantReferences
          : [],
        caveats: Array.isArray(parsed?.caveats)
          ? parsed!.caveats.filter((s): s is string => typeof s === 'string')
          : [],
      },
      reasoningSummary:
        typeof parsed?.reasoningSummary === 'string'
          ? parsed!.reasoningSummary
          : `Researched: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
