import { HttpStatus } from '@nestjs/common';
import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type {
  DistributedJobDto,
  JobEventDto,
  ListDistributedJobsQueryDto,
  QueueMetricsDto,
  WorkerNodeDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { toDistributedJobDto, toJobEventDto, toWorkerNodeDto } from '../mappers/to-distributed-job-dto.mapper.js';

export class ListWorkerNodesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(ListWorkerNodesQuery)
export class ListWorkerNodesHandler implements IQueryHandler<ListWorkerNodesQuery, WorkerNodeDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWorkerNodesQuery): Promise<WorkerNodeDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const nodes = await this.prisma.workerNode.findMany({
      where: { organizationId: query.organizationId },
      orderBy: { registeredAt: 'asc' },
    });
    return nodes.map(toWorkerNodeDto);
  }
}

export class ListDistributedJobsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly filter: ListDistributedJobsQueryDto,
  ) {}
}

@QueryHandler(ListDistributedJobsQuery)
export class ListDistributedJobsHandler implements IQueryHandler<ListDistributedJobsQuery, DistributedJobDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListDistributedJobsQuery): Promise<DistributedJobDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const jobs = await this.prisma.distributedJob.findMany({
      where: {
        organizationId: query.organizationId,
        status: query.filter.status,
        type: query.filter.type,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return jobs.map(toDistributedJobDto);
  }
}

export class GetDistributedJobQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly jobId: string,
  ) {}
}

@QueryHandler(GetDistributedJobQuery)
export class GetDistributedJobHandler implements IQueryHandler<GetDistributedJobQuery, DistributedJobDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetDistributedJobQuery): Promise<DistributedJobDto> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const job = await this.prisma.distributedJob.findFirst({
      where: { id: query.jobId, organizationId: query.organizationId },
    });
    if (!job) {
      throw new AppException('DISTRIBUTED_JOB_NOT_FOUND', 'Job not found.', HttpStatus.NOT_FOUND);
    }
    return toDistributedJobDto(job);
  }
}

export class ListJobEventsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly jobId: string,
  ) {}
}

@QueryHandler(ListJobEventsQuery)
export class ListJobEventsHandler implements IQueryHandler<ListJobEventsQuery, JobEventDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListJobEventsQuery): Promise<JobEventDto[]> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);
    const job = await this.prisma.distributedJob.findFirst({
      where: { id: query.jobId, organizationId: query.organizationId },
    });
    if (!job) {
      throw new AppException('DISTRIBUTED_JOB_NOT_FOUND', 'Job not found.', HttpStatus.NOT_FOUND);
    }
    const events = await this.prisma.jobEvent.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: 'asc' },
    });
    return events.map(toJobEventDto);
  }
}

/// Queue-depth + throughput snapshot for the Distributed Job System's
/// metrics surface (also exported at `/enterprise/organizations/:id/
/// distributed-jobs/metrics/prometheus` in Prometheus text format — see
/// `observability/metrics.controller.ts`). `averageWaitMs` is computed
/// over the most recent 200 jobs that have actually started (queued-time
/// to startedAt), a sampled estimate rather than a full-table aggregate —
/// same "capped in-memory computation" tradeoff Module 9's Analytics
/// handler already documents.
export class GetQueueMetricsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
  ) {}
}

@QueryHandler(GetQueueMetricsQuery)
export class GetQueueMetricsHandler implements IQueryHandler<GetQueueMetricsQuery, QueueMetricsDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetQueueMetricsQuery): Promise<QueueMetricsDto> {
    await resolveOrganizationMembership(this.prisma, query.userId, query.organizationId);

    const [statusGroups, priorityGroups, workers, recentlyStarted] = await Promise.all([
      this.prisma.distributedJob.groupBy({
        by: ['status'],
        where: { organizationId: query.organizationId },
        _count: true,
      }),
      this.prisma.distributedJob.groupBy({
        by: ['priority'],
        where: { organizationId: query.organizationId, status: 'QUEUED' },
        _count: true,
      }),
      this.prisma.workerNode.findMany({ where: { organizationId: query.organizationId } }),
      this.prisma.distributedJob.findMany({
        where: { organizationId: query.organizationId, startedAt: { not: null } },
        orderBy: { startedAt: 'desc' },
        take: 200,
        select: { createdAt: true, startedAt: true },
      }),
    ]);

    const waits = recentlyStarted
      .filter((j) => j.startedAt)
      .map((j) => j.startedAt!.getTime() - j.createdAt.getTime());
    const averageWaitMs = waits.length > 0 ? waits.reduce((a, b) => a + b, 0) / waits.length : null;

    return {
      byStatus: Object.fromEntries(statusGroups.map((g) => [g.status, g._count])),
      byPriority: Object.fromEntries(priorityGroups.map((g) => [g.priority, g._count])),
      onlineWorkers: workers.filter((w) => w.status === 'ONLINE').length,
      totalCapacity: workers.reduce((sum, w) => sum + w.maxConcurrency, 0),
      currentLoad: workers.reduce((sum, w) => sum + w.currentLoad, 0),
      averageWaitMs,
    };
  }
}
