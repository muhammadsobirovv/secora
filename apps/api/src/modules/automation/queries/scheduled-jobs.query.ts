import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { ListScheduledJobsQueryDto, ScheduledJobDto, ScheduledJobRunDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { toScheduledJobDto } from '../mappers/to-scheduled-job-dto.mapper.js';

export class ListScheduledJobsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly filters: ListScheduledJobsQueryDto,
  ) {}
}

@QueryHandler(ListScheduledJobsQuery)
export class ListScheduledJobsHandler implements IQueryHandler<ListScheduledJobsQuery, ScheduledJobDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListScheduledJobsQuery): Promise<ScheduledJobDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
    const jobs = await this.prisma.scheduledJob.findMany({
      where: {
        workspaceId: query.workspaceId,
        projectId: query.filters.projectId,
        programId: query.filters.programId,
        kind: query.filters.kind,
        enabled: query.filters.enabled,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map(toScheduledJobDto);
  }
}

export class ListScheduledJobRunsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly jobId: string,
  ) {}
}

@QueryHandler(ListScheduledJobRunsQuery)
export class ListScheduledJobRunsHandler implements IQueryHandler<ListScheduledJobRunsQuery, ScheduledJobRunDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListScheduledJobRunsQuery): Promise<ScheduledJobRunDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
    const runs = await this.prisma.scheduledJobRun.findMany({
      where: { scheduledJobId: query.jobId, scheduledJob: { workspaceId: query.workspaceId } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return runs.map((r) => ({
      id: r.id,
      scheduledJobId: r.scheduledJobId,
      status: r.status,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      log: r.log,
      resultSummary: (r.resultSummary as Record<string, unknown> | null) ?? null,
    }));
  }
}
