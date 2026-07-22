import type { ScheduledJobDto } from '@pentesthub/shared';
import type { ScheduledJob } from '../../../prisma-types.js';

export function toScheduledJobDto(job: ScheduledJob): ScheduledJobDto {
  return {
    id: job.id,
    workspaceId: job.workspaceId,
    projectId: job.projectId,
    programId: job.programId,
    targetId: job.targetId,
    name: job.name,
    kind: job.kind,
    cronExpression: job.cronExpression,
    config: (job.config as Record<string, unknown> | null) ?? null,
    enabled: job.enabled,
    lastRunAt: job.lastRunAt ? job.lastRunAt.toISOString() : null,
    nextRunAt: job.nextRunAt ? job.nextRunAt.toISOString() : null,
    lastRunStatus: job.lastRunStatus,
    createdBy: job.createdBy,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
