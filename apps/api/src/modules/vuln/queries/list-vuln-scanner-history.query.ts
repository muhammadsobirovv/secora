import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { VulnScannerHistoryEntryDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';

/// "Scanner History" (spec API section) as its own endpoint, independent
/// of the dashboard summary — the Scanner History page wants this without
/// paying for severity/status counts + recent findings it doesn't show.
export class ListVulnScannerHistoryQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(ListVulnScannerHistoryQuery)
export class ListVulnScannerHistoryHandler implements IQueryHandler<
  ListVulnScannerHistoryQuery,
  VulnScannerHistoryEntryDto[]
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly vulnScanJobsRepository: VulnScanJobsRepository,
  ) {}

  async execute(
    query: ListVulnScannerHistoryQuery,
  ): Promise<VulnScannerHistoryEntryDto[]> {
    const workspace =
      await this.workspacesRepository.findPersonalWorkspaceForUser(
        query.userId,
      );
    if (!workspace) {
      throw new AppException(
        'WORKSPACE_NOT_FOUND',
        'Workspace not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const rows = await this.vulnScanJobsRepository.getScannerHistory(
      workspace.id,
    );
    return rows.map((row) => ({
      scanner: row.scanner,
      totalRuns: row.totalRuns,
      completedRuns: row.completedRuns,
      failedRuns: row.failedRuns,
      totalFindings: row.totalFindings,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
    }));
  }
}
