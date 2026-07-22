import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type {
  ClaimJobRequestDto,
  CompleteJobRequestDto,
  DistributedJobDto,
  EnqueueDistributedJobRequestDto,
  FailJobRequestDto,
} from '@pentesthub/shared';
import type { Prisma } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { toDistributedJobDto } from '../mappers/to-distributed-job-dto.mapper.js';
import { PRIORITY_ORDER } from '../job-scheduling.util.js';

// ---------------------------------------------------------------------------
// Enqueue
// ---------------------------------------------------------------------------

export class EnqueueDistributedJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: EnqueueDistributedJobRequestDto,
  ) {}
}

@CommandHandler(EnqueueDistributedJobCommand)
export class EnqueueDistributedJobHandler
  implements ICommandHandler<EnqueueDistributedJobCommand, DistributedJobDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: EnqueueDistributedJobCommand): Promise<DistributedJobDto> {
    await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);

    const job = await this.prisma.distributedJob.create({
      data: {
        organizationId: command.organizationId,
        workspaceId: command.data.workspaceId,
        type: command.data.type,
        payload: command.data.payload as Prisma.InputJsonValue,
        priority: command.data.priority ?? 'NORMAL',
        maxAttempts: command.data.maxAttempts ?? 3,
        scheduledFor: command.data.scheduledFor ? new Date(command.data.scheduledFor) : undefined,
        createdBy: command.userId,
      },
    });
    await this.prisma.jobEvent.create({ data: { jobId: job.id, type: 'QUEUED' } });

    return toDistributedJobDto(job);
  }
}

// ---------------------------------------------------------------------------
// Claim — a worker asks for up to `maxJobs` QUEUED jobs matching its
// declared capabilities. Priority scheduling: CRITICAL > HIGH > NORMAL >
// LOW, then oldest-scheduled-first within a priority band (FIFO fairness).
// Atomic per-job claim via a conditional updateMany (status: 'QUEUED' in
// the WHERE clause) rather than SELECT-then-UPDATE, so two workers racing
// to claim the same row can never both succeed — the loser's updateMany
// simply matches zero rows.
// ---------------------------------------------------------------------------

export class ClaimNextJobsCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workerId: string,
    public readonly data: ClaimJobRequestDto,
  ) {}
}

@CommandHandler(ClaimNextJobsCommand)
export class ClaimNextJobsHandler implements ICommandHandler<ClaimNextJobsCommand, DistributedJobDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: ClaimNextJobsCommand): Promise<DistributedJobDto[]> {
    const worker = await this.prisma.workerNode.findUnique({ where: { id: command.workerId } });
    if (!worker) {
      throw new AppException('WORKER_NODE_NOT_FOUND', 'Worker node not found.', HttpStatus.NOT_FOUND);
    }
    if (worker.status !== 'ONLINE') {
      // A DRAINING/OFFLINE/UNHEALTHY node gets no new work — draining
      // finishes what it has, an unhealthy node shouldn't have any left
      // (WorkerReaperService already migrated it away).
      return [];
    }

    const availableSlots = Math.max(0, worker.maxConcurrency - worker.currentLoad);
    const maxJobs = Math.min(command.data.maxJobs ?? availableSlots, availableSlots);
    if (maxJobs <= 0) {
      return [];
    }

    const candidates = await this.prisma.distributedJob.findMany({
      where: {
        status: 'QUEUED',
        type: { in: command.data.capabilities },
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: maxJobs * 3, // over-fetch since some may lose the race to claim
    });
    const sorted = candidates.sort(
      (a, b) => PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority] || a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const claimed: DistributedJobDto[] = [];
    for (const candidate of sorted) {
      if (claimed.length >= maxJobs) break;
      const result = await this.prisma.distributedJob.updateMany({
        where: { id: candidate.id, status: 'QUEUED' },
        data: { status: 'ASSIGNED', workerId: worker.id, startedAt: new Date() },
      });
      if (result.count === 1) {
        await this.prisma.jobEvent.create({
          data: { jobId: candidate.id, workerId: worker.id, type: 'ASSIGNED' },
        });
        const updated = await this.prisma.distributedJob.findUniqueOrThrow({ where: { id: candidate.id } });
        claimed.push(toDistributedJobDto(updated));
      }
    }

    if (claimed.length > 0) {
      await this.prisma.workerNode.update({
        where: { id: worker.id },
        data: { currentLoad: worker.currentLoad + claimed.length },
      });
    }
    return claimed;
  }
}

// ---------------------------------------------------------------------------
// Complete / Fail / Cancel
// ---------------------------------------------------------------------------

export class CompleteDistributedJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
    public readonly data: CompleteJobRequestDto,
  ) {}
}

@CommandHandler(CompleteDistributedJobCommand)
export class CompleteDistributedJobHandler
  implements ICommandHandler<CompleteDistributedJobCommand, DistributedJobDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CompleteDistributedJobCommand): Promise<DistributedJobDto> {
    const job = await this.prisma.distributedJob.findUnique({ where: { id: command.jobId } });
    if (!job) {
      throw new AppException('DISTRIBUTED_JOB_NOT_FOUND', 'Job not found.', HttpStatus.NOT_FOUND);
    }
    const updated = await this.prisma.distributedJob.update({
      where: { id: job.id },
      data: { status: 'SUCCEEDED', finishedAt: new Date() },
    });
    await this.prisma.jobEvent.create({
      data: { jobId: job.id, workerId: job.workerId, type: 'SUCCEEDED' },
    });
    if (job.workerId) {
      await this.decrementLoad(job.workerId);
    }
    return toDistributedJobDto(updated);
  }

  private async decrementLoad(workerId: string): Promise<void> {
    const worker = await this.prisma.workerNode.findUnique({ where: { id: workerId } });
    if (worker) {
      await this.prisma.workerNode.update({
        where: { id: workerId },
        data: { currentLoad: Math.max(0, worker.currentLoad - 1) },
      });
    }
  }
}

/// Retry policy: `attempts` increments; if under `maxAttempts` the job goes
/// back to QUEUED (unassigned — any healthy worker with matching
/// capabilities may pick it up next, not necessarily the one that just
/// failed it) with a RETRIED event, otherwise it's terminally FAILED.
export class FailDistributedJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly jobId: string,
    public readonly data: FailJobRequestDto,
  ) {}
}

@CommandHandler(FailDistributedJobCommand)
export class FailDistributedJobHandler implements ICommandHandler<FailDistributedJobCommand, DistributedJobDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: FailDistributedJobCommand): Promise<DistributedJobDto> {
    const job = await this.prisma.distributedJob.findUnique({ where: { id: command.jobId } });
    if (!job) {
      throw new AppException('DISTRIBUTED_JOB_NOT_FOUND', 'Job not found.', HttpStatus.NOT_FOUND);
    }
    const attempts = job.attempts + 1;
    const willRetry = attempts < job.maxAttempts;

    const updated = await this.prisma.distributedJob.update({
      where: { id: job.id },
      data: willRetry
        ? { status: 'QUEUED', attempts, lastError: command.data.error, workerId: null, startedAt: null }
        : { status: 'FAILED', attempts, lastError: command.data.error, finishedAt: new Date() },
    });
    await this.prisma.jobEvent.create({
      data: {
        jobId: job.id,
        workerId: job.workerId,
        type: willRetry ? 'RETRIED' : 'FAILED',
        message: command.data.error,
      },
    });
    if (job.workerId) {
      const worker = await this.prisma.workerNode.findUnique({ where: { id: job.workerId } });
      if (worker) {
        await this.prisma.workerNode.update({
          where: { id: worker.id },
          data: { currentLoad: Math.max(0, worker.currentLoad - 1) },
        });
      }
    }
    return toDistributedJobDto(updated);
  }
}

export class CancelDistributedJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly jobId: string,
  ) {}
}

@CommandHandler(CancelDistributedJobCommand)
export class CancelDistributedJobHandler implements ICommandHandler<CancelDistributedJobCommand, DistributedJobDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CancelDistributedJobCommand): Promise<DistributedJobDto> {
    await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);

    const job = await this.prisma.distributedJob.findFirst({
      where: { id: command.jobId, organizationId: command.organizationId },
    });
    if (!job) {
      throw new AppException('DISTRIBUTED_JOB_NOT_FOUND', 'Job not found.', HttpStatus.NOT_FOUND);
    }
    if (job.status === 'SUCCEEDED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
      throw new AppException(
        'DISTRIBUTED_JOB_NOT_CANCELLABLE',
        `A job in status ${job.status} cannot be cancelled.`,
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.prisma.distributedJob.update({
      where: { id: job.id },
      data: { status: 'CANCELLED', finishedAt: new Date() },
    });
    await this.prisma.jobEvent.create({ data: { jobId: job.id, workerId: job.workerId, type: 'CANCELLED' } });
    return toDistributedJobDto(updated);
  }
}
