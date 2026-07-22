import type { CommentDto } from '@pentesthub/shared';
import type { Comment } from '../../../prisma-types.js';

export function toCommentDto(comment: Comment, mentionedUserIds: string[]): CommentDto {
  return {
    id: comment.id,
    workspaceId: comment.workspaceId,
    entityType: comment.entityType,
    entityId: comment.entityId,
    authorId: comment.authorId,
    bodyMarkdown: comment.bodyMarkdown,
    parentCommentId: comment.parentCommentId,
    editedAt: comment.editedAt ? comment.editedAt.toISOString() : null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    mentionedUserIds,
  };
}
