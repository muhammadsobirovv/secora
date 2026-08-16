import type { ReactionDto, WatcherDto } from '@pentesthub/shared';
import type { Reaction, Watcher } from '../../../prisma-types.js';

export function toWatcherDto(watcher: Watcher): WatcherDto {
  return {
    id: watcher.id,
    entityType: watcher.entityType,
    entityId: watcher.entityId,
    userId: watcher.userId,
    createdAt: watcher.createdAt.toISOString(),
  };
}

export function toReactionDto(reaction: Reaction): ReactionDto {
  return {
    id: reaction.id,
    entityType: reaction.entityType,
    entityId: reaction.entityId,
    userId: reaction.userId,
    emoji: reaction.emoji,
    createdAt: reaction.createdAt.toISOString(),
  };
}
