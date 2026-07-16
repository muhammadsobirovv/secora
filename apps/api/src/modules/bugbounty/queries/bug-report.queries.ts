import { HttpStatus, Inject } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  BugReportDto,
  ListBugReportsQueryDto,
  RenderedBugReportDto,
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
import {
  resolveBugReportForCaller,
  resolveWorkspaceForCaller,
} from '../authorization.util.js';
import { toBugReportDto } from '../mappers/to-bug-report-dto.mapper.js';
import { renderBugReportTemplate } from '../reports/bug-report-template-renderer.js';

export class ListBugReportsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filter: ListBugReportsQueryDto,
  ) {}
}

@QueryHandler(ListBugReportsQuery)
export class ListBugReportsHandler implements IQueryHandler<
  ListBugReportsQuery,
  BugReportDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
  ) {}

  async execute(query: ListBugReportsQuery): Promise<BugReportDto[]> {
    const workspace = await resolveWorkspaceForCaller(
      this.workspacesRepository,
      query.userId,
    );

    const reports = await this.reportsRepository.list({
      workspaceId: workspace.id,
      programId: query.filter.programId,
      projectId: query.filter.projectId,
      findingId: query.filter.findingId,
      status: query.filter.status,
      search: query.filter.search,
    });

    return Promise.all(
      reports.map(async (report) => {
        const evidenceIds = await this.reportsRepository.listEvidenceIds(
          report.id,
        );
        return toBugReportDto(report, evidenceIds);
      }),
    );
  }
}

export class GetBugReportQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly reportId: string,
  ) {}
}

@QueryHandler(GetBugReportQuery)
export class GetBugReportHandler implements IQueryHandler<
  GetBugReportQuery,
  BugReportDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(BUG_REPORTS_REPOSITORY)
    private readonly reportsRepository: BugReportsRepository,
  ) {}

  async execute(query: GetBugReportQuery): Promise<BugReportDto> {
    const { report } = await resolveBugReportForCaller(
      this.workspacesRepository,
      this.reportsRepository,
      query.userId,
      query.reportId,
    );
    const evidenceIds = await this.reportsRepository.listEvidenceIds(report.id);
    return toBugReportDto(report, evidenceIds);
  }
}

/// Renders the report's stored `template` into text — see
/// RenderedBugReportDto. Used both by a preview endpoint and as the first
/// step of every export format (task 104's Exports build on this content
/// rather than re-deriving it).
export class RenderBugReportQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly reportId: string,
  ) {}
}

@QueryHandler(RenderBugReportQuery)
export class RenderBugReportHandler implements IQueryHandler<
  RenderBugReportQuery,
  RenderedBugReportDto
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

  async execute(query: RenderBugReportQuery): Promise<RenderedBugReportDto> {
    const { report } = await resolveBugReportForCaller(
      this.workspacesRepository,
      this.reportsRepository,
      query.userId,
      query.reportId,
    );

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

    const content = renderBugReportTemplate(report.template, {
      report,
      program,
      finding,
    });

    return { reportId: report.id, template: r