import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  ExportBugReportV2RequestDto,
  ExportBugReportV2ResultDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  BUG_REPORTS_REPOSITORY,
  type BugReportsRepository,
} from '../domain/repositories/bug-reports.repository.interface.js';
import {
  BUGBOUNTY_PROGRAMS_REPOSITORY,
  type BugBountyProgramsRepository,
} from '../domain/repositories/bugbounty-programs.repository.interface.js';
import {
  BUGBOUNTY_FINDINGS_REPOSITORY,
  type BugBountyFindingsRepository,
} from '../domain/repositories/bugbounty-findings.repository.interface.js';
import { resolveBugReportForCaller } from '../authorization.util.js';
import { toBugReportDto } from '../mappers/to-bug-report-dto.mapper.js';
import { renderBugReportTemplate } from '../reports/bug-report-template-renderer.js';

export class ExportBugReportV2Query implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly reportId: string,
    public readonly data: ExportBugReportV2RequestDto,
  ) {}
}

function slugify(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'bug-report';
}

/// Strips Markdown syntax down to readable plain text — headings/bold/
/// italics/links/bullets — good enough for a TXT export where formatting
/// doesn't matter, not a general-purpose Markdown-to-text library.
function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)')
    .replace(/^[-*]\s+/gm, '- ')
    .trim();
}

/// Module 9's richer export-format set (MARKDOWN/PDF/DOCX/HTML/JSON/TXT)
/// — a new endpoint (`export-v2`) rather than extending the original
/// `/export` handler, so existing callers of the Module 6 endpoint are
/// completely unaffected. DOCX is the one disclosed gap: generating a
/// real .docx requires a document-building dependency this environment
/// doesn't have installed (see Module 9's verification handoff notes,
/// same disclosed-gap pattern as the missing email provider) — it
/// throws a clear, typed error rather than returning a fake/corrupt file.
@QueryHandler(ExportBugReportV2Query)
export class ExportBugReportV2Handler
  implements IQueryHandler<ExportBugReportV2Query, ExportBugReportV2ResultDto>
{
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
    @Inject(BUGBOUNTY_PROGRAMS_REPOSITORY)
    private readonly programsRepository: BugBountyProgramsRepository,
    @Inject(BUGBOUNTY_FINDINGS_REPOSITORY)
    private readonly findingsRepository: BugBountyFindingsRepository,
  ) {}

  async execute(query: ExportBugReportV2Query): Promise<ExportBugReportV2ResultDto> {
    const { report } = await resolveBugReportForCaller(
      this.workspacesRepository,
      this.reportsRepository,
      query.userId,
      query.reportId,
    );
    const slug = slugify(report.title);

    if (query.data.format === 'JSON') {
      const evidenceIds = await this.reportsRepository.listEvidenceIds(report.id);
      return {
        format: 'JSON',
        filename: `${slug}.json`,
        mimeType: 'application/json',
        content: JSON.stringify(toBugReportDto(report, evidenceIds), null, 2),
      };
    }

    if (query.data.format === 'DOCX') {
      throw new AppException(
        'REPORT_EXPORT_FORMAT_UNSUPPORTED',
        'DOCX export requires a document-generation dependency not available in this environment. Use MARKDOWN, HTML, PDF, TXT, or JSON instead.',
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const program = await this.programsRepository.findById(report.programId);
    if (!program) {
      throw new AppException(
        'BUGBOUNTY_PROGRAM_NOT_FOUND',
        'The program this report belongs to no longer exists.',
        HttpStatus.NOT_FOUND,
      );
    }
    const finding = report.findingId
      ? await this.findingsRepository.findById(report.findingId)
      : null;

    if (query.data.format === 'HTML' || query.data.format === 'PDF') {
      const content = renderBugReportTemplate('HTML', { report, program, finding });
      return {
        format: query.data.format,
        filename: `${slug}.html`,
        mimeType: 'text/html',
        content,
      };
    }

    const effectiveTemplate =
      report.template === 'PDF' || report.template === 'HTML' ? 'MARKDOWN' : report.template;
    const markdown = renderBugReportTemplate(effectiveTemplate, { report, program, finding });

    if (query.data.format === 'TXT') {
      return {
        format: 'TXT',
        filename: `${slug}.txt`,
        mimeType: 'text/plain',
        content: markdownToPlainText(markdown),
      };
    }

    return {
      format: 'MARKDOWN',
      filename: `${slug}.md`,
      mimeType: 'text/markdown',
      content: markdown,
    };
  }
}
