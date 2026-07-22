import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { AssignmentDto, CreateAssignmentRequestDto, UpdateAssignmentRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { toAssignmentDto } from '../mappers/to-assignment-dto.mapper.js';

export class CreateAssignmentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly data: CreateAssignmentRequestDto,
  ) {}
}

@CommandHandler(CreateAssignmentCommand)
export class CreateAssignmentHandler implements ICommandHandler<CreateAssignmentCommand, AssignmentDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateAssignmentCommand): Promise<AssignmentDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    // The assignee must themselves be a workspace member — assigning work
    // to someone with no access to the workspace would be a dead end.
    await resolveWorkspaceMembership(this.prisma, command.data.assigneeId, command.workspaceId);

    const assignment = await this.prisma.assignment.create({
      data: {
        workspaceId: command.workspaceId,
        entityType: command.data.entityType,
        entityId: command.data.entityId,
        assigneeId: command.data.assigneeId,
        assignedBy: command.userId,
        dueAt: command.data.dueAt ? new Date(command.data.dueAt) : undefined,
      },
    });
    return toAssignmentDto(assignment);
  }
}

export class UpdateAssignmentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly assignmentId: string,
    public readonly data: UpdateAssignmentRequestDto,
  ) {}
}

@CommandHandler(UpdateAssignmentCommand)
export class UpdateAssignmentHandler implements ICommandHandler<UpdateAssignmentCommand, AssignmentDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateAssignmentCommand): Promise<AssignmentDto> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);

    const existing = await this.prisma.assignment.findFirst({
      where: { id: command.assignmentId, workspaceId: command.workspaceId },
    });
    if (!existing) {
      throw new AppException('ASSIGNMENT_NOT_FOUND', 'Assignment not found.', HttpStatus.NOT_FOUND);
    }
    // The assignee can update their own assignment's status (that's the
    // whole point — marking your own work in progress/done); anyone else
    // needs TRIAGER+ to reassign/re-schedule.
    const isAssignee = existing.assigneeId === command.userId;
    const canManage = role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER' || role === 'TRIAGER';
    if (!isAssignee && !canManage) {
      throw new AppException(
        'INSUFFICIENT_WORKSPACE_ROLE',
        'Only the assignee or a Triager+ can update this assignment.',
        HttpStatus.FORBIDDEN,
      );
    }

    const updated = await this.prisma.assignment.update({
      where: { id: existing.id },
      data: {
        status: command.data.status,
        dueAt: command.data.dueAt === undefined ? undefined : command.data.dueAt ? new Date(command.data.dueAt) : null,
      },
    });
    return toAssignmentDto(updated);
  }
}

export class DeleteAssignmentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly assignmentId: string,
  ) {}
}

@CommandHandler(DeleteAssignmentCommand)
export class DeleteAssignmentHandler implements ICommandHandler<DeleteAssignmentCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteAssignmentCommand): Promise<void> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    if (role === 'REVIEWER' || role === 'MEMBER') {
      throw new AppException(
        'INSUFFICIENT_WORKSPACE_ROLE',
        'Removing an assignment requires the Triager role or higher.',
        HttpStatus.FORBIDDEN,
      );
    }
    const existing = await this.prisma.assignment.findFirst({
      where: { id: command.assignmentId, workspaceId: command.workspaceId },
    });
    if (!existing) {
      throw new AppException('ASSIGNMENT_NOT_FOUND', 'Assignment not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.assignment.delete({ where: { id: existing.id } });
  }
}
