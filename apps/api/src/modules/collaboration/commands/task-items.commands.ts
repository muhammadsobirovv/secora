import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { CreateTaskItemRequestDto, TaskItemDto, UpdateTaskItemRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { toTaskItemDto } from '../mappers/to-task-item-dto.mapper.js';

export class CreateTaskItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly data: CreateTaskItemRequestDto,
  ) {}
}

@CommandHandler(CreateTaskItemCommand)
export class CreateTaskItemHandler implements ICommandHandler<CreateTaskItemCommand, TaskItemDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateTaskItemCommand): Promise<TaskItemDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);

    const task = await this.prisma.taskItem.create({
      data: {
        workspaceId: command.workspaceId,
        projectId: command.data.projectId,
        entityType: command.data.entityType,
        entityId: command.data.entityId,
        title: command.data.title,
        description: command.data.description,
        assigneeId: command.data.assigneeId,
        dueAt: command.data.dueAt ? new Date(command.data.dueAt) : undefined,
        createdBy: command.userId,
      },
    });
    return toTaskItemDto(task);
  }
}

export class UpdateTaskItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly taskId: string,
    public readonly data: UpdateTaskItemRequestDto,
  ) {}
}

@CommandHandler(UpdateTaskItemCommand)
export class UpdateTaskItemHandler implements ICommandHandler<UpdateTaskItemCommand, TaskItemDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateTaskItemCommand): Promise<TaskItemDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);

    const existing = await this.prisma.taskItem.findFirst({
      where: { id: command.taskId, workspaceId: command.workspaceId, deletedAt: null },
    });
    if (!existing) {
      throw new AppException('TASK_ITEM_NOT_FOUND', 'Task not found.', HttpStatus.NOT_FOUND);
    }

    const updated = await this.prisma.taskItem.update({
      where: { id: existing.id },
      data: {
        title: command.data.title,
        description: command.data.description,
        assigneeId: command.data.assigneeId,
        dueAt: command.data.dueAt ? new Date(command.data.dueAt) : undefined,
        done: command.data.done,
      },
    });
    return toTaskItemDto(updated);
  }
}

export class DeleteTaskItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly taskId: string,
  ) {}
}

@CommandHandler(DeleteTaskItemCommand)
export class DeleteTaskItemHandler implements ICommandHandler<DeleteTaskItemCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteTaskItemCommand): Promise<void> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    const existing = await this.prisma.taskItem.findFirst({
      where: { id: command.taskId, workspaceId: command.workspaceId, deletedAt: null },
    });
    if (!existing) {
      throw new AppException('TASK_ITEM_NOT_FOUND', 'Task not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.taskItem.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }
}
