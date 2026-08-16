import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { ToggleReactionRequestDto, ReactionDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { resolveCollaborationEntityWorkspace } from '../collaboration-entity-resolver.util.js';
import { toReactionDto } from '../mappers/to-watcher-reaction-dto.mapper.js';

const MAX_EMOJI_LENGTH = 8;

/// Toggle a single (entityType, entityId, userId, emoji) reaction on or
/// off, matching Reaction's compound unique index. As with watchers,
/// authorization is derived from the entity itself, never a
/// client-supplied workspaceId.
export class ToggleReactionCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: ToggleReactionRequestDto,
  ) {}
}

@CommandHandler(ToggleReactionCommand)
export class ToggleReactionHandler implements ICommandHandler<ToggleReactionCommand, ReactionDto | null> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: ToggleReactionCommand): Promise<ReactionDto | null> {
    if (!command.data.emoji || command.data.emoji.length > MAX_EMOJI_LENGTH) {
      throw new AppException('INVALID_REACTION_EMOJI', 'Emoji must be 1-8 characters.', HttpStatus.BAD_REQUEST);
    }

    const workspaceId = await resolveCollaborationEntityWorkspace(
      this.prisma,
      command.data.entityType,
      command.data.entityId,
    );
    await resolveWorkspaceMembership(this.prisma, command.userId, workspaceId);

    const existing = await this.prisma.reaction.findUnique({
      where: {
        entityType_entityId_userId_emoji: {
          entityType: command.data.entityType,
          entityId: command.data.entityId,
          userId: command.userId,
          emoji: command.data.emoji,
        },
      },
    });

    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
      return null;
    }

    const created = await this.prisma.reaction.create({
      data: {
        entityType: command.data.entityType,
        entityId: command.data.entityId,
        userId: command.userId,
        emoji: command.data.emoji,
      },
    });
    return toReactionDto(created);
  }
}
