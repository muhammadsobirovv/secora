import type { VulnScanJobDto, VulnScanJobToolRunDto } from '@pentesthub/shared';
import type { VulnScanJobWithToolRuns } from '../domain/repositories/vuln-scan-jobs.repository.interface.js';

function toToolRunDto(
  toolRun: VulnScanJobWithToolRuns['toolRuns'][number],
): VulnScanJobToolRunDto {
  return {
    id: toolRun.id,
    jobId: toolRun.jobId,
    scanner: toolRun.scanner,
    status: toolRun.status,
    startedAt: toolRun.startedAt?.toISOString() ?? null,
    completedAt: toolRun.completedAt?.toISOString() ?? null,
    exitCode: toolRun.exitCode,
    findingsCount: toolRun.findingsCount,
    errorMessage: toolRun.errorMessage,
  };
}

export function toVulnScanJobDto(job: VulnScanJobWithToolRuns): VulnScanJobDto {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    targetId: job.targetId,
    scanners: job.scanners,
    templateId: job.templateId,
    config: job.config as Record<string, unknown> | null,
    status: job.status,
    priority: job.priority,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    timeoutSeconds: job.timeoutSeconds,
    requestedBy: job.requestedBy,
    error: job.error,
    claimedAt: job.claimedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    cancelRequestedAt: job.cancelRequestedAt?.toISOString() ?? null,
    pauseRequestedAt: job.pauseRequestedAt?.toISOString() ?? null,
    pausedAt: job.pausedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    toolRuns: job.toolRuns.map(toToolRunDto),
    findingsCount: job.toolRuns.reduce((sum, tr) => sum + tr.findingsCount, 0),
    completedWithErrors: job.status === 'COMPLETED' && !!job.error,
  };
}
