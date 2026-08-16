import { CommandHandler, EventBus, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type { CommentDto, CreateCommentRequestDto, UpdateCommentRequestDto } from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../workspace-membership.util.js';
import { toCommentDto } from '../mappers/to-comment-dto.mapper.js';
import { CommentCreatedEvent, MentionCreatedEvent } from '../events/comment-events.js';

/// Extracts `@<uuid>` mention tokens from a comment body — the frontend's
/// mention picker inserts them in this exact shape (see
/// apps/web equivalent component, mirroring how Markdown editors
/// elsewhere in this codebase embed structured tokens in free text
/// rather than a separate rich-text AST). Deliberately permissive (any
/// UUID-shaped `@token`, not validated against real workspace members
/// here) — `createMentions` below silently skips ids that don't resolve
/// to a real user via the FK constraint failing, wrapped in a try/catch
/// per mention so one bad token doesn't fail the whole comment.
const MENTION_PATTERN = /@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

function extractMentionedUserIds(bodyMarkdown: string): string[] {
  const ids = new Set<string>();
  for (const match of bodyMarkdown.matchAll(MENTION_PATTERN)) {
    ids.add(match[1].toLowerCase());
  }
  return [...ids];
}

export class CreateCommentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly data: CreateCommentRequestDto,
  ) {}
}

@CommandHandler(CreateCommentCommand)
export class CreateCommentHandler implements ICommandHandler<CreateCommentCommand, CommentDto> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateCommentCommand): Promise<CommentDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);

    const comment = await this.prisma.comment.create({
      data: {
        workspaceId: command.workspaceId,
        entityType: command.data.entityType,
        entityId: command.data.entityId,
        authorId: command.userId,
        bodyMarkdown: command.data.bodyMarkdown,
        parentCommentId: command.data.parentCommentId,
      },
    });

    const mentionedUserIds = extractMentionedUserIds(command.data.bodyMarkdown);
    const createdMentions: string[] = [];
    for (const mentionedUserId of mentionedUserIds) {
      try {
        const mention = await this.prisma.mention.create({ data: { commentId: comment.id, mentionedUserId } });
        createdMentions.push(mentionedUserId);
        // Targeted, per-user event — see MentionCreatedEvent's doc comment.
        this.eventBus.publish(
          new MentionCreatedEvent(command.workspaceId, mention.id, command.userId, mentionedUserId, {
            commentId: comment.id,
            entityType: comment.entityType,
            entityId: comment.entityId,
          }),
        );
      } catch {
        // Not a real user, or not a member of this workspace at all (FK
        // failure) — skip silently rather than failing the whole comment
        // over a bad @mention token.
      }
    }

    // Module 16 — Real-time gateway (task #391): the only place a new
    // comment is published as a domain event. Previously this handler
    // published nothing at all, so comments never reached the Activity
    // Timeline or any real-time listener (see comment-events.ts's doc
    // comment for the full rationale).
    this.eventBus.publish(
      new CommentCreatedEvent(command.workspaceId, comment.id, command.userId, {
        entityType: comment.entityType,
        entityId: comment.entityId,
        parentCommentId: comment.parentCommentId,
      }),
    );

    return toCommentDto(comment, createdMentions);
  }
}

export class UpdateCommentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly commentId: string,
    public readonly data: UpdateCommentRequestDto,
  ) {}
}

@CommandHandler(UpdateCommentCommand)
export class UpdateCommentHandler implements ICommandHandler<UpdateCommentCommand, CommentDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateCommentCommand): Promise<CommentDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);

    const existing = await this.prisma.comment.findFirst({
      where: { id: command.commentId, workspaceId: command.workspaceId, deletedAt: null },
    });
    if (!existing) {
      throw new AppException('COMMENT_NOT_FOUND', 'Comment not found.', HttpStatus.NOT_FOUND);
    }
    if (existing.authorId !== command.userId) {
      throw new AppException(
        'INSUFFICIENT_WORKSPACE_ROLE',
        'Only the comment author can edit it.',
        HttpStatus.FORBIDDEN,
      );
    }

    const updated = await this.prisma.comment.update({
      where: { id: command.commentId },
      data: { bodyMarkdown: command.data.bodyMarkdown, editedAt: new Date() },
    });
    const mentions = await this.prisma.mention.findMany({ where: { commentId: updated.id } });
    return toCommentDto(updated, mentions.map((m) => m.mentionedUserId));
  }
}

export class DeleteCommentCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly commentId: string,
  ) {}
}

@CommandHandler(DeleteCommentCommand)
export class DeleteCommentHandler implements ICommandHandler<DeleteCommentCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteCommentCommand): Promise<void> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);

    const existing = await this.prisma.comment.findFirst({
      where: { id: command.commentId, workspaceId: command.workspaceId, deletedAt: null },
    });
    if (!existing) {
      throw new AppException('COMMENT_NOT_FOUND', 'Comment not found.', HttpStatus.NOT_FOUND);
    }
    // Author can always delete their own comment; MANAGER+ can moderate
    // anyone's.
    const isAuthor = existing.authorId === command.userId;
    const isModerator = role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
    if (!isAuthor && !isModerator) {
      throw new AppException(
        'INSUFFICIENT_WORKSPACE_ROLE',
        'Only the comment author or a Manager+ can delete this comment.',
        HttpStatus.FORBIDDEN,
      );
    }

    await this.prisma.comment.update({ where: { id: command.commentId }, data: { deletedAt: new Date() } });
  }
}

export class MarkMentionReadCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly mentionId: string,
  ) {}
}

@CommandHandler(MarkMentionReadCommand)
export class MarkMentionReadHandler implements ICommandHandler<MarkMentionReadCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: MarkMentionReadCommand): Promise<void> {
    const mention = await this.prisma.mention.findFirst({
      where: { id: command.mentionId, mentionedUserId: command.userId },
    });
    if (!mention) {
      throw new AppException('MENTION_NOT_FOUND', 'Mention not found.', HttpStatus.NOT_FOUND);
    }
    await this.prisma.mention.update({ where: { id: mention.id }, data: { readAt: new Date() } });
  }
}
