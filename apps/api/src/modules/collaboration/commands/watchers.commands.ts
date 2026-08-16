import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import type { ToggleWatcherRequestDto, WatcherDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { resolveCollaborationEntityWorkspace } from '../collaboration-entity-resolver.util.js';
import { toWatcherDto } from '../mappers/to-watcher-reaction-dto.mapper.js';

/// Watch/unwatch is a single toggle action (matches the shared
/// `ToggleWatcherRequestDto` contract — there's no separate create vs.
/// delete verb on the wire). Authorization is derived entirely from the
/// entity being watched (`resolveCollaborationEntityWorkspace`), never
/// from a client-supplied workspaceId — this command doesn't even accept
/// one.
export class ToggleWatcherCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: ToggleWatcherRequestDto,
  ) {}
}

@CommandHandler(ToggleWatcherCommand)
export class ToggleWatcherHandler implements ICommandHandler<ToggleWatcherCommand, WatcherDto | null> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: ToggleWatcherCommand): Promise<WatcherDto | null> {
    const workspaceId = await resolveCollaborationEntityWorkspace(
      this.prisma,
      command.data.entityType,
      command.data.entityId,
    );
    await resolveWorkspaceMembership(this.prisma, command.userId, workspaceId);

    const existing = await this.prisma.watcher.findUnique({
      where: {
        entityType_entityId_userId: {
          entityType: command.data.entityType,
          entityId: command.data.entityId,
          userId: command.userId,
        },
      },
    });

    if (existing) {
      await this.prisma.watcher.delete({ where: { id: existing.id } });
      return null;
    }

    const created = await this.prisma.watcher.create({
      data: {
        entityType: command.data.entityType,
        entityId: command.data.entityId,
        userId: command.userId,
      },
    });
    return toWatcherDto(created);
  }
}
