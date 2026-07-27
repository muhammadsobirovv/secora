import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { BugReportDto, UpdateBugReportRequestDto } from '@pentesthub/shared';
import { GetBugReportQuery } from '../../bugbounty/queries/bug-report.queries.js';
import { UpdateBugReportCommand } from '../../bugbounty/commands/bug-report-lifecycle.commands.js';
import type { AiTool, AiToolContext } from './ai-tool.interface.js';

/// The same section-kind vocabulary ReportWriterAgent's prompt uses
/// (apps/api/src/modules/agent/agents/report-writer.agent.ts) — kept in
/// sync by convention rather than a shared import, since the agent's copy
/// is a prompt-contract string and this one is a persistence mapping;
/// duplicating a short literal list is simpler than introducing a shared
/// dependency between modules/agent and modules/ai for eight strings.
type ReportSectionKind =
  | 'EXECUTIVE_SUMMARY'
  | 'TECHNICAL_SUMMARY'
  | 'REPRODUCTION_STEPS'
  | 'IMPACT'
  | 'RISK'
  | 'REMEDIATION'
  | 'EVIDENCE_CAPTION'
  | 'APPENDIX';

const VALID_SECTION_KINDS: ReportSectionKind[] = [
  'EXECUTIVE_SUMMARY',
  'TECHNICAL_SUMMARY',
  'REPRODUCTION_STEPS',
  'IMPACT',
  'RISK',
  'REMEDIATION',
  'EVIDENCE_CAPTION',
  'APPENDIX',
];

const SECTION_HEADINGS: Record<ReportSectionKind, string> = {
  EXECUTIVE_SUMMARY: 'Executive Summary',
  TECHNICAL_SUMMARY: 'Technical Summary',
  REPRODUCTION_STEPS: 'Reproduction Steps',
  IMPACT: 'Impact',
  RISK: 'Risk',
  REMEDIATION: 'Remediation',
  EVIDENCE_CAPTION: 'Evidence',
  APPENDIX: 'Appendix',
};

/// Module 11 — AI Report Writer, Support Incremental Report Generation
/// (task #229). BugReportDto has no ReportSection table — it's flat
/// scalar columns (summary/impact/stepsToReproduce/proofOfConcept/
/// mitigation/references) — so each section kind maps onto its closest
/// matching column; kinds that share a column (e.g. TECHNICAL_SUMMARY and
/// REPRODUCTION_STEPS both feed `stepsToReproduce`) or have no column at
/// all (RISK/EVIDENCE_CAPTION/APPENDIX) get *appended* under a heading
/// rather than overwriting or being silently dropped — unlike
/// GenerateBugReportDraftHandler's one-shot regeneration (task #99),
/// which always replaces the whole field and drops `risk` entirely (no
/// column for it). This tool is what makes report writing genuinely
/// incremental: ReportWriterAgent can be invoked as several small
/// AgentTasks (one per section) across an OrchestrationRun, each call
/// appending onto whatever the previous call already wrote, always
/// re-reading `version` first so concurrent edits are still optimistic-
/// lock-safe (see UpdateBugReportCommand's version-conflict handling).
@Injectable()
export class AppendReportSectionTool implements AiTool {
  readonly name = 'append_report_section' as const;
  readonly description = `Appends an AI-drafted section to an existing bug report (Module 6/9 Report Builder), rather than only producing throwaway text. Input: { reportId: string, sectionKind: string, title?: string, content: string }. Valid sectionKind values: ${VALID_SECTION_KINDS.join(', ')}. Safe to call multiple times for the same report — content accumulates under headings rather than overwriting.`;

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(
    input: Record<string, unknown>,
    context: AiToolContext,
  ): Promise<Record<string, unknown>> {
    const reportId = typeof input.reportId === 'string' ? input.reportId : null;
    const content = typeof input.content === 'string' ? input.content.trim() : '';
    if (!reportId) return { error: 'reportId (string) is required.' };
    if (!content) return { error: 'content (non-empty string) is required.' };

    const rawKind = typeof input.sectionKind === 'string' ? input.sectionKind.toUpperCase() : '';
    const sectionKind: ReportSectionKind = (
      VALID_SECTION_KINDS as string[]
    ).includes(rawKind)
      ? (rawKind as ReportSectionKind)
      : 'TECHNICAL_SUMMARY';
    const heading =
      typeof input.title === 'string' && input.title.trim()
        ? input.title.trim()
        : SECTION_HEADINGS[sectionKind];

    const current = (await this.queryBus.execute(
      new GetBugReportQuery(context.userId, reportId),
    )) as BugReportDto;

    const appendToField = (existing: string | null): string =>
      existing ? `${existing}\n\n## ${heading}\n${content}` : content;

    const data: UpdateBugReportRequestDto = { version: current.version };
    let field: string;

    switch (sectionKind) {
      case 'EXECUTIVE_SUMMARY':
        data.summary = appendToField(current.summary);
        field = 'summary';
        break;
      case 'TECHNICAL_SUMMARY':
      case 'REPRODUCTION_STEPS':
        data.stepsToReproduce = appendToField(current.stepsToReproduce);
        field = 'stepsToReproduce';
        break;
      case 'IMPACT':
      case 'RISK':
        data.impact = appendToField(current.impact);
        field = 'impact';
        break;
      case 'REMEDIATION':
        data.mitigation = appendToField(current.mitigation);
        field = 'mitigation';
        break;
      case 'EVIDENCE_CAPTION':
        data.proofOfConcept = appendToField(current.proofOfConcept);
        field = 'proofOfConcept';
        break;
      case 'APPENDIX': {
        const entry = `${heading}: ${content}`;
        data.references = current.references.includes(entry)
          ? current.references
          : [...current.references, entry];
        field = 'references';
        break;
      }
    }

    const updated = (await this.commandBus.execute(
      new UpdateBugReportCommand(context.userId, reportId, data),
    )) as BugReportDto;

    return {
      reportId: updated.id,
      field,
      sectionKind,
      version: updated.version,
      message: `Appended "${heading}" (${sectionKind}) to report ${updated.id}, field "${field}".`,
    };
  }
}
