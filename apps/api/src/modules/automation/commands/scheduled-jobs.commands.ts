import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type {
  CreateScheduledJobRequestDto,
  ScheduledJobDto,
  ScheduledJobRunDto,
  UpdateScheduledJobRequestDto,
} from '@pentesthub/shared';
import { SCHEDULED_JOB_KIND_DEFAULT_CRON } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import { requireRole } from '../../collaboration/permissions.util.js';
import { toScheduledJobDto } from '../mappers/to-scheduled-job-dto.mapper.js';
import { computeNextRunAt } from '../scheduled-job-cron.util.js';
import { ScheduledJobRunnerService } from '../services/scheduled-job-runner.service.js';

export class CreateScheduledJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly data: CreateScheduledJobRequestDto,
  ) {}
}

@CommandHandler(CreateScheduledJobCommand)
export class CreateScheduledJobHandler implements ICommandHandler<CreateScheduledJobCommand, ScheduledJobDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateScheduledJobCommand): Promise<ScheduledJobDto> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(role, 'MANAGER');

    const cronExpression = command.data.cronExpression ?? SCHEDULED_JOB_KIND_DEFAULT_CRON[command.data.kind];
    const job = await this.prisma.scheduledJob.create({
      data: {
        workspaceId: command.workspaceId,
        projectId: command.data.projectId,
        programId: command.data.programId,
        targetId: command.data.targetId,
        name: command.data.name,
        kind: command.data.kind,
        cronExpression,
        config: command.data.config,
        enabled: command.data.enabled ?? true,
        nextRunAt: computeNextRunAt(cronExpression),
        createdBy: command.userId,
      },
    });
    return toScheduledJobDto(job);
  }
}

export class UpdateScheduledJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly jobId: string,
    public readonly data: UpdateScheduledJobRequestDto,
  ) {}
}

@CommandHandler(UpdateScheduledJobCommand)
export class UpdateScheduledJobHandler implements ICommandHandler<UpdateScheduledJobCommand, ScheduledJobDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateScheduledJobCommand): Promise<ScheduledJobDto> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(role, 'MANAGER');

    const existing = await this.prisma.scheduledJob.findFirst({
      where: { id: command.jobId, workspaceId: command.workspaceId, deletedAt: null },
    });
    if (!existing) {
      throw new AppException('SCHEDULED_JOB_NOT_FOUND', 'Scheduled job not found.', HttpStatus.NOT_FOUND);
    }

    const cronExpression = command.data.cronExpression ?? existing.cronExpression;
    const updated = await this.prisma.scheduledJob.update({
      where: { id: existing.id },
      data: {
        name: command.data.name,
        kind: command.data.kind,
        cronExpression,
        config: command.data.config,
        enabled: command.data.enabled,
        nextRunAt: command.data.cronExpression || command.data.enabled !== undefined ? computeNextRunAt(cronExpression) : undefined,
      },
    });
    return toScheduledJobDto(updated);
  }
}

export class DeleteScheduledJobCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly jobId: string,
  ) {}
}

@CommandHandler(DeleteScheduledJobCommand)
export class DeleteScheduledJobHandler implements ICommandHandler<DeleteScheduledJobCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteScheduledJobCommand): Promise<void> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(role, 'MANAGER');

    const existing = await this.prisma.scheduledJob.findFirst({
      where: { id: command.jobId, workspaceId: command.workspaceId, deletedAt: null },
    });
    if (!existing) {
      throw new AppException('SCHEDULED_JOB_NOT_FOUND', 'Scheduled job not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.scheduledJob.update({ where: { id: existing.id }, data: { deletedAt: new Date(), enabled: false } });
  }
}

/// Runs a scheduled job immediately, out of band from its cron schedule
/// — "run now" button in the UI. Delegates to the same
/// `ScheduledJobRunnerService.runJob` a real cron tick would call, so
/// there's exactly one execution path (see that service's doc comment).
export class RunScheduledJobNowCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly jobId: string,
  ) {}
}

@CommandHandler(RunScheduledJobNowCommand)
export class RunScheduledJobNowHandler implements ICommandHandler<RunScheduledJobNowCommand, ScheduledJobRunDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: ScheduledJobRunnerService,
  ) {}

  async execute(command: RunScheduledJobNowCommand): Promise<ScheduledJobRunDto> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    requireRole(role, 'MANAGER');

    const job = await this.prisma.scheduledJob.findFirst({
      where: { id: command.jobId, workspaceId: command.workspaceId, deletedAt: null },
    });
    if (!job) {
      throw new AppException('SCHEDULED_JOB_NOT_FOUND', 'Scheduled job not found.', HttpStatus.NOT_FOUND);
    }

    // Delegates to the same ScheduledJobRunnerService.runJob a real cron
    // tick would call (see that service's doc comment) — one execution
    // path whether triggered on-schedule or via "run now".
    const run = await this.runner.runJob(job.id);
    return {
      id: run.id,
      scheduledJobId: run.scheduledJobId,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
      log: run.log,
      resultSummary: (run.resultSummary as Record<string, unknown> | null) ?? null,
    };
  }
}
