import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type {
  CreateWorkflowRequestDto,
  UpdateWorkflowRequestDto,
  WorkflowDto,
} from '@pentesthub/shared';
import type { Prisma } from '../../../prisma-types.js';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveOrganizationMembership } from '../../enterprise/organization-membership.util.js';
import { requireEnterpriseRole } from '../../enterprise/enterprise-permissions.util.js';
import { computeNextRunAt } from '../../automation/scheduled-job-cron.util.js';
import { validateWorkflowDefinition } from '../workflow-definition.schema.js';
import { toWorkflowDto } from '../mappers/to-workflow-dto.mapper.js';

function requireCronForSchedule(triggerType: string, cronExpression: string | undefined): void {
  if (triggerType === 'SCHEDULE' && !cronExpression) {
    throw new AppException('WORKFLOW_DEFINITION_INVALID', 'triggerType SCHEDULE requires a cronExpression.', HttpStatus.BAD_REQUEST);
  }
}

export class CreateWorkflowCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly data: CreateWorkflowRequestDto,
  ) {}
}

@CommandHandler(CreateWorkflowCommand)
export class CreateWorkflowHandler implements ICommandHandler<CreateWorkflowCommand, WorkflowDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateWorkflowCommand): Promise<WorkflowDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'TEAM_LEAD');

    requireCronForSchedule(command.data.triggerType, command.data.cronExpression);
    const definition = validateWorkflowDefinition(command.data.definition);

    const workflow = await this.prisma.workflow.create({
      data: {
        organizationId: command.organizationId,
        workspaceId: command.data.workspaceId ?? null,
        name: command.data.name,
        description: command.data.description ?? null,
        definitionJson: definition as unknown as Prisma.InputJsonValue,
        triggerType: command.data.triggerType,
        cronExpression: command.data.cronExpression ?? null,
        nextRunAt: command.data.triggerType === 'SCHEDULE' ? computeNextRunAt(command.data.cronExpression!) : null,
        enabled: command.data.enabled ?? true,
        createdBy: command.userId,
      },
    });
    return toWorkflowDto(workflow);
  }
}

export class UpdateWorkflowCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workflowId: string,
    public readonly data: UpdateWorkflowRequestDto,
  ) {}
}

@CommandHandler(UpdateWorkflowCommand)
export class UpdateWorkflowHandler implements ICommandHandler<UpdateWorkflowCommand, WorkflowDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateWorkflowCommand): Promise<WorkflowDto> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.workflow.findFirst({
      where: { id: command.workflowId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('WORKFLOW_NOT_FOUND', 'Workflow not found.', HttpStatus.NOT_FOUND);
    }

    const nextTriggerType = command.data.triggerType ?? existing.triggerType;
    const nextCron = command.data.cronExpression ?? existing.cronExpression ?? undefined;
    requireCronForSchedule(nextTriggerType, nextCron);

    const definition = command.data.definition ? validateWorkflowDefinition(command.data.definition) : undefined;

    const updated = await this.prisma.workflow.update({
      where: { id: existing.id },
      data: {
        name: command.data.name,
        description: command.data.description,
        ...(definition ? { definitionJson: definition as unknown as Prisma.InputJsonValue } : {}),
        triggerType: command.data.triggerType,
        cronExpression: command.data.cronExpression,
        enabled: command.data.enabled,
        ...(nextTriggerType === 'SCHEDULE' && (command.data.cronExpression || command.data.triggerType)
          ? { nextRunAt: computeNextRunAt(nextCron!) }
          : {}),
        ...(nextTriggerType !== 'SCHEDULE' ? { nextRunAt: null } : {}),
      },
    });
    return toWorkflowDto(updated);
  }
}

export class DeleteWorkflowCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly organizationId: string,
    public readonly workflowId: string,
  ) {}
}

@CommandHandler(DeleteWorkflowCommand)
export class DeleteWorkflowHandler implements ICommandHandler<DeleteWorkflowCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteWorkflowCommand): Promise<void> {
    const { role } = await resolveOrganizationMembership(this.prisma, command.userId, command.organizationId);
    requireEnterpriseRole(role, 'ADMIN');

    const existing = await this.prisma.workflow.findFirst({
      where: { id: command.workflowId, organizationId: command.organizationId },
    });
    if (!existing) {
      throw new AppException('WORKFLOW_NOT_FOUND', 'Workflow not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.workflow.delete({ where: { id: existing.id } });
  }
}
