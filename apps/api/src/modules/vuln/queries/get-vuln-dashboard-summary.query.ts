import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, HttpStatus } from '@nestjs/common';
import type { VulnDashboardSummaryDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../../workspaces/domain/repositories/workspaces.repository.interface.js';
import {
  VULN_FINDINGS_REPOSITORY,
  type VulnFindingsRepository,
} from '../domain/repositories/vuln-findings.repository.interface.js';
import {
  VULN_SCAN_JOBS_REPOSITORY,
  type VulnScanJobsRepository,
} from '../domain/repositories/vuln-scan-jobs.repository.interface.js';
import { toVulnFindingDto } from '../mappers/to-vuln-finding-dto.mapper.js';

/// Composes three independent reads into one payload for the
/// Vulnerability Dashboard page — Severity Charts (severityCounts),
/// Scanner Status (scannerHistory), Running Jobs (runningJobsCount), and
/// Recent Findings, all in a single round trip.
export class GetVulnDashboardSummaryQuery implements IQuery {
  constructor(public readonly userId: string) {}
}

@QueryHandler(GetVulnDashboardSummaryQuery)
export class GetVulnDashboardSummaryHandler implements IQueryHandler<
  GetVulnDashboardSummaryQuery,
  VulnDashboardSummaryDto
> {
  constructor(
    @Inject(WORKSPACES_REPOSITORY)
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(VULN_FINDINGS_REPOSITORY)
    private readonly vulnFindingsRepository: VulnFindingsRepository,
    @Inject(VULN_SCAN_JOBS_REPOSITORY)
    private readonly vulnScanJobsRepository: VulnScanJobsRepository,
  ) {}

  async execute(
    query: GetVulnDashboardSummaryQuery,
  ): Promise<VulnDashboardSummaryDto> {
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

    const [
      severityCounts,
      statusCounts,
      runningJobsCount,
      recentFindings,
      scannerHistory,
    ] = await Promise.all([
      this.vulnFindingsRepository.countBySeverity(workspace.id),
      this.vulnFindingsRepository.countByStatus(workspace.id),
      this.vulnScanJobsRepository.countRunning(workspace.id),
      this.vulnFindingsRepository.list({
        workspaceId: workspace.id,
        limit: 10,
      }),
      this.vulnScanJobsRepository.getScannerHistory(workspace.id),
    ]);

    const totalFindings = Object.values(severityCounts).reduce(
      (sum, n) => sum + n,
      0,
    );

    return {
      severityCounts,
      statusCounts,
      runningJobsCount,
      totalFindings,
      recentFindings: recentFindings.map(toVulnFindingDto),
      scannerHistory: scannerHistory.map((row) => ({
        scanner: row.scanner,
        totalRuns: row.totalRuns,
        completedRuns: row.completedRuns,
        failedRuns: row.failedRuns,
        totalFindings: row.totalFindings,
        lastRunAt: row.lastRunAt?.toISOString() ?? null,
      })),
    };
  }
}
