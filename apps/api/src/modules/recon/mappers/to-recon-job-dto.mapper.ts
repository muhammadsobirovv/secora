import type { ReconJobDto, ReconJobToolRunDto } from '@pentesthub/shared';
import type { ReconJobWithToolRuns } from '../domain/repositories/recon-jobs.repository.interface.js';

function toToolRunDto(
  toolRun: ReconJobWithToolRuns['toolRuns'][number],
): ReconJobToolRunDto {
  return {
    id: toolRun.id,
    jobId: toolRun.jobId,
    tool: toolRun.tool,
    status: toolRun.status,
    startedAt: toolRun.startedAt?.toISOString() ?? null,
    completedAt: toolRun.completedAt?.toISOString() ?? null,
    exitCode: toolRun.exitCode,
    findingsCount: toolRun.findingsCount,
    errorMessage: toolRun.errorMessage,
  };
}

export function toReconJobDto(job: ReconJobWithToolRuns): ReconJobDto {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    targetId: job.targetId,
    tools: job.tools,
    status: job.status,
    retryCount: job.retryCount,
    maxRetries: job.maxRetries,
    timeoutSeconds: job.timeoutSeconds,
    requestedBy: job.requestedBy,
    error: job.error,
    claimedAt: job.claimedAt?.toISOString() ?? null,
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    cancelRequestedAt: job.cancelRequestedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    toolRuns: job.toolRuns.map(toToolRunDto),
    findingsCount: job.toolRuns.reduce((sum, tr) => sum + tr.findingsCount, 0),
  };
}
