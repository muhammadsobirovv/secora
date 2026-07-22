import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { TriggerWorkflowRequestDto, WorkflowRunDto } from '@pentesthub/shared';
import type { Prisma } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { WorkflowExecutorService } from '../services/workflow-executor.service.js';
import { toWorkflowRunDto } from '../mappers/to-workflow-dto.mapper.js';

export class TriggerWorkflowCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workflowId: string,
    public readonly data: TriggerWorkflowRequestDto,
  ) {}
}

/// Creates a PENDING WorkflowRun and immediately hands it to
/// WorkflowExecutorService — unlike webhook delivery (deliberately
/// deferred to a poller tick because it targets an arbitrary external
/// URL), a manually-triggered workflow run's first several steps are
/// often fast, in-process operations (condition/notify/ai_analysis), so
/// running synchronously here gives the caller a useful WorkflowRunDto
/// back immediately. A run that hits a `delay` step mid-execution still
/// pauses correctly and is picked up by WorkflowRunnerService like any
/// other paused run — see WorkflowExecutorService's doc comment.
@CommandHandler(TriggerWorkflowCommand)
export class TriggerWorkflowHandler implements ICommandHandler<TriggerWorkflowCommand, WorkflowRunDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: WorkflowExecutorService,
  ) {}

  async execute(command: TriggerWorkflowCommand): Promise<WorkflowRunDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'TEAM_LEAD');

    const workflow = await this.prisma.workflow.findFirst({
      where: { id: command.workflowId, organizationId: command.organizationId },
    });
    if (!workflow) {
      throw new AppException('WORKFLOW_NOT_FOUND', 'Workflow not found.', HttpStatus.NOT_FOUND);
    }

    const run = await this.prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        status: 'PENDING',
        triggeredBy: command.userId,
        input: (command.data.input as Prisma.InputJsonValue) ?? {},
      },
    });

    await this.executor.start(run.id);

    const finished = await this.prisma.workflowRun.findUniqueOrThrow({ where: { id: run.id } });
    return toWorkflowRunDto(finished);
  }
}

export class CancelWorkflowRunCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workflowId: string,
    public readonly runId: string,
  ) {}
}

/// Cancellation only takes effect between steps (there's no way to
/// interrupt a step that's already mid-execution, e.g. an in-flight
/// fetch() to an integration) — it works by flipping status to
/// CANCELLED so WorkflowRunnerService's resume() no-ops on it (checks
/// `status !== 'RUNNING'` before resuming) and by clearing
/// `pausedAtStepKey`/`resumeAt` so it never gets picked up again. A run
/// paused at a `delay` step is the common real-world case this matters
/// for.
@CommandHandler(CancelWorkflowRunCommand)
export class CancelWorkflowRunHandler implements ICommandHandler<CancelWorkflowRunCommand, WorkflowRunDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CancelWorkflowRunCommand): Promise<WorkflowRunDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'TEAM_LEAD');

    const workflow = await this.prisma.workflow.findFirst({
      where: { id: command.workflowId, organizationId: command.organizationId },
    });
    if (!workflow) {
      throw new AppException('WORKFLOW_NOT_FOUND', 'Workflow not found.', HttpStatus.NOT_FOUND);
    }
    const run = await this.prisma.workflowRun.findFirst({ where: { id: command.runId, workflowId: workflow.id } });
    if (!run) {
      throw new AppException('WORKFLOW_RUN_NOT_FOUND', 'Workflow run not found.', HttpStatus.NOT_FOUND);
    }
    if (run.status !== 'PENDING' && run.status !== 'RUNNING') {
      throw new AppException('WORKFLOW_RUN_NOT_CANCELLABLE', 'Only PENDING or RUNNING runs can be cancelled.', HttpStatus.CONFLICT);
    }

    const cancelled = await this.prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: 'CANCELLED', pausedAtStepKey: null, resumeAt: null, finishedAt: new Date() },
    });
    return toWorkflowRunDto(cancelled);
  }
}
