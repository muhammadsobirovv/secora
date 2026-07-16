import type { BookmarkDto } from '@pentesthub/shared';
import type { Bookmark } from '../../../prisma-types.js';

export function toBookmarkDto(bookmark: Bookmark): BookmarkDto {
  return {
    id: bookmark.id,
    workspaceId: bookmark.workspaceId,
    userId: bookmark.userId,
    entityType: bookmark.entityType,
    entityId: bookmark.entityId,
    createdAt: bookmark.createdAt.toISOString(),
  };
}
