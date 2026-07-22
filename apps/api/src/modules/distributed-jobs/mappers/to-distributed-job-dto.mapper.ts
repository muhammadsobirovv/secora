import type { DistributedJobDto, JobEventDto, WorkerNodeDto } from '@pentesthub/shared';
import type { DistributedJob, JobEvent, Prisma, WorkerNode } from '../../../prisma-types.js';

export function toWorkerNodeDto(row: WorkerNode): WorkerNodeDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    hostname: row.hostname,
    status: row.status,
    capabilities: row.capabilities,
    maxConcurrency: row.maxConcurrency,
    currentLoad: row.currentLoad,
    registeredAt: row.registeredAt.toISOString(),
    lastHeartbeatAt: row.lastHeartbeatAt.toISOString(),
  };
}

export function toDistributedJobDto(row: DistributedJob): DistributedJobDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    type: row.type,
    payload: row.payload as Prisma.JsonObject as Record<string, unknown>,
    priority: row.priority,
    status: row.status,
    workerId: row.workerId,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    scheduledFor: row.scheduledFor ? row.scheduledFor.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toJobEventDto(row: JobEvent): JobEventDto {
  return {
    id: row.id,
    jobId: row.jobId,
    workerId: row.workerId,
    type: row.type,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}
