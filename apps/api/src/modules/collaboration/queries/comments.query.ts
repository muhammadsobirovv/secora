import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { CommentDto, ListCommentsQueryDto, ListMentionsQueryDto, MentionDto } from '@pentesthub/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { toCommentDto } from '../mappers/to-comment-dto.mapper.js';

export class ListCommentsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly filters: ListCommentsQueryDto,
  ) {}
}

@QueryHandler(ListCommentsQuery)
export class ListCommentsHandler implements IQueryHandler<ListCommentsQuery, CommentDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListCommentsQuery): Promise<CommentDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);

    const comments = await this.prisma.comment.findMany({
      where: {
        workspaceId: query.workspaceId,
        entityType: query.filters.entityType,
        entityId: query.filters.entityId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (comments.length === 0) return [];

    const mentions = await this.prisma.mention.findMany({
      where: { commentId: { in: comments.map((c) => c.id) } },
    });
    const mentionsByComment = new Map<string, string[]>();
    for (const mention of mentions) {
      const list = mentionsByComment.get(mention.commentId) ?? [];
      list.push(mention.mentionedUserId);
      mentionsByComment.set(mention.commentId, list);
    }

    return comments.map((c) => toCommentDto(c, mentionsByComment.get(c.id) ?? []));
  }
}

export class ListMentionsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly filters: ListMentionsQueryDto,
  ) {}
}

@QueryHandler(ListMentionsQuery)
export class ListMentionsHandler implements IQueryHandler<ListMentionsQuery, MentionDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListMentionsQuery): Promise<MentionDto[]> {
    const mentions = await this.prisma.mention.findMany({
      where: {
        mentionedUserId: query.userId,
        readAt: query.filters.unreadOnly ? null : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return mentions.map((m) => ({
      id: m.id,
      commentId: m.commentId,
      mentionedUserId: m.mentionedUserId,
      createdAt: m.createdAt.toISOString(),
      readAt: m.readAt ? m.readAt.toISOString() : null,
    }));
  }
}
