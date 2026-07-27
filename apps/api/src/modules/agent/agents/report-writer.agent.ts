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

/// Report Writer Agent — the AI Report Writer's agent-framework seat.
/// Drafts one report section at a time (Support incremental report
/// generation) from whatever upstream findings/evidence context it's
/// given; AiReportWriterService (task #229) is what actually assembles
/// these section drafts into a full BugReport/ReportDraft document via the
/// existing Report Builder (Module 6/9) — this agent only produces the
/// text.
@Injectable()
export class ReportWriterAgent extends PromptDrivenAgent {
  readonly type = 'REPORT_WRITER' as const;
  readonly displayName = 'Report Writer Agent';
  readonly description =
    'Drafts report sections (executive summary, technical detail, reproduction steps, impact, remediation) from findings and evidence context.';
  readonly allowedTools: readonly AiToolName[] = [
    'search_findings',
    'search_evidence',
    'search_notes',
    'draft_report',
    // Module 11 — AI Report Writer, incremental generation (task #229):
    // persists this agent's drafted section into a real BugReport.
    'append_report_section',
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
    return `You are the Report Writer Agent in an autonomous penetration-testing multi-agent system. Given a report-writing task naming which section(s) to draft, draft the section's content. If the task input includes a "reportId", call the append_report_section tool ({ reportId, sectionKind, title, content }) to persist your drafted section into the real report before you finish — Support Incremental Report Generation means each of your tasks adds one more section to the same report rather than only producing text nobody saves. Whether or not a reportId was given, your FINAL response must be ONLY a single JSON object: { "sectionKind": "EXECUTIVE_SUMMARY"|"TECHNICAL_SUMMARY"|"REPRODUCTION_STEPS"|"IMPACT"|"RISK"|"REMEDIATION"|"EVIDENCE_CAPTION"|"APPENDIX", "title": string, "content": string, "reasoningSummary": string, "confidence": number }. "content" is publication-ready prose for that section — clear, precise, no placeholder text. EXECUTIVE_SUMMARY must be readable by a non-technical stakeholder; TECHNICAL_SUMMARY/REPRODUCTION_STEPS may be technical.`;
  }

  protected buildUserPrompt(input: AgentExecutionInput): string {
    return `Report section task: ${input.title}\nInput: ${this.formatTaskInput(input)}${this.formatUpstreamContext(input)}`;
  }

  protected parseCompletion(text: string, input: AgentExecutionInput): AgentPromptOutcome {
    const parsed = extractAgentJson<{
      sectionKind?: unknown;
      title?: unknown;
      content?: unknown;
      reasoningSummary?: unknown;
      confidence?: unknown;
    }>(text);

    const validKinds = [
      'EXECUTIVE_SUMMARY',
      'TECHNICAL_SUMMARY',
      'REPRODUCTION_STEPS',
      'IMPACT',
      'RISK',
      'REMEDIATION',
      'EVIDENCE_CAPTION',
      'APPENDIX',
    ];
    const rawSectionKind =
      typeof parsed?.sectionKind === 'string' ? parsed.sectionKind : null;
    const sectionKind =
      rawSectionKind && validKinds.includes(rawSectionKind)
        ? rawSectionKind
        : 'TECHNICAL_SUMMARY';

    return {
      output: {
        sectionKind,
        title: typeof parsed?.title === 'string' ? parsed!.title : input.title,
        content: typeof parsed?.content === 'string' ? parsed!.content : text.trim(),
      },
      reasoningSummary:
        typeof parsed?.reasoningSummary === 'string'
          ? parsed!.reasoningSummary
          : `Drafted report section: ${input.title}`,
      confidenceScore: clampConfidence(parsed?.confidence),
      sources: [],
    };
  }
}
