import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  ExportBugReportRequestDto,
  ExportBugReportResultDto,
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

export class ExportBugReportQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly reportId: string,
    public readonly data: ExportBugReportRequestDto,
  ) {}
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'bug-report';
}

function toCsvField(value: string | number | null): string {
  const str = value === null ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/// Builds the downloadable content for every BugReportExportFormat. PDF
/// specifically has no server-side renderer — see
/// ExportBugReportResultDto's doc comment.
@QueryHandler(ExportBugReportQuery)
export class ExportBugReportHandler implements IQueryHandler<
  ExportBugReportQuery,
  ExportBugReportResultDto
> {
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

  async execute(
    query: ExportBugReportQuery,
  ): Promise<ExportBugReportResultDto> {
    const { report } = await resolveBugReportForCaller(
      this.workspacesRepository,
      this.reportsRepository,
      query.userId,
      query.reportId,
    );

    const slug = slugify(report.title);

    if (query.data.format === 'JSON') {
      const evidenceIds = await this.reportsRepository.listEvidenceIds(
        report.id,
      );
      return {
        format: 'JSON',
        filename: `${slug}.json`,
        mimeType: 'application/json',
        content: JSON.stringify(toBugReportDto(report, evidenceIds), null, 2),
      };
    }

    if (query.data.format === 'CSV') {
      const header = [
        'title',
        'status',
        'template',
        'cvssScore',
        'cvssVector',
        'bountyAmount',
        'currency',
        'submittedAt',
        'resolvedAt',
      ];
      const row = [
        report.title,
        report.status,
        report.template,
        report.cvssScore,
        report.cvssVector,
        report.bountyAmount,
        report.currency,
        report.submittedAt?.toISOString() ?? null,
        report.resolvedAt?.toISOString() ?? null,
      ].map(toCsvField);
      return {
        format: 'CSV',
        filename: `${slug}.csv`,
        mimeType: 'text/csv',
        content: `${header.join(',')}\n${row.join(',')}\n`,
      };
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
      const content = renderBugReportTemplate('HTML', {
        report,
        program,
        finding,
      });
      return {
        format: query.data.format,
        filename: `${slug}.html`,
        mimeType: 'text/html',
        content,
      };
    }

    // MARKDOWN — honor the report's own template style (HackerOne/
    // Bugcrowd/Intigriti/generic Markdown) rather than forcing generic
    // Markdown, so exporting matches what the report actually looks like
    // in the app.
    const effectiveTemplate =
      report.template === 'PDF' || report.template === 'HTML'
        ? 'MARKDOWN'
        : report.template;
    const content = renderBugReportTemplate(effectiveTemplate, {
      report,
      program,
      finding,
    });
    return {
      format