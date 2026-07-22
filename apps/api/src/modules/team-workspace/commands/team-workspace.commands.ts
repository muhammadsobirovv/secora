import { CommandHandler, ICommand, ICommandHandler } from '@nestjs/cqrs';
import { HttpStatus } from '@nestjs/common';
import type {
  CreateInternalChatChannelRequestDto,
  CreateWikiPageRequestDto,
  DecideReviewQueueItemRequestDto,
  InternalChatChannelDto,
  InternalChatMessageDto,
  ReviewQueueItemDto,
  SendInternalChatMessageRequestDto,
  SubmitReviewQueueItemRequestDto,
  UpdateWikiPageRequestDto,
  WikiPageDto,
} from '@pentesthub/shared';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import {
  toInternalChatChannelDto,
  toInternalChatMessageDto,
  toReviewQueueItemDto,
  toWikiPageDto,
} from '../mappers/to-team-workspace-dto.mapper.js';

function isModerator(role: string): boolean {
  return role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER';
}

// ---------------------------------------------------------------------------
// Wiki
// ---------------------------------------------------------------------------

export class CreateWikiPageCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateWikiPageRequestDto,
  ) {}
}

@CommandHandler(CreateWikiPageCommand)
export class CreateWikiPageHandler implements ICommandHandler<CreateWikiPageCommand, WikiPageDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateWikiPageCommand): Promise<WikiPageDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.data.workspaceId);
    const page = await this.prisma.wikiPage.create({
      data: {
        workspaceId: command.data.workspaceId,
        parentPageId: command.data.parentPageId ?? null,
        title: command.data.title,
        contentMarkdown: command.data.contentMarkdown,
        createdBy: command.userId,
      },
    });
    return toWikiPageDto(page);
  }
}

export class UpdateWikiPageCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly pageId: string,
    public readonly data: UpdateWikiPageRequestDto,
  ) {}
}

@CommandHandler(UpdateWikiPageCommand)
export class UpdateWikiPageHandler implements ICommandHandler<UpdateWikiPageCommand, WikiPageDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateWikiPageCommand): Promise<WikiPageDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    const existing = await this.prisma.wikiPage.findFirst({ where: { id: command.pageId, workspaceId: command.workspaceId } });
    if (!existing) {
      throw new AppException('WIKI_PAGE_NOT_FOUND', 'Wiki page not found.', HttpStatus.NOT_FOUND);
    }
    const updated = await this.prisma.wikiPage.update({
      where: { id: existing.id },
      data: {
        parentPageId: command.data.parentPageId !== undefined ? command.data.parentPageId : existing.parentPageId,
        title: command.data.title ?? existing.title,
        contentMarkdown: command.data.contentMarkdown ?? existing.contentMarkdown,
      },
    });
    return toWikiPageDto(updated);
  }
}

export class DeleteWikiPageCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly pageId: string,
  ) {}
}

@CommandHandler(DeleteWikiPageCommand)
export class DeleteWikiPageHandler implements ICommandHandler<DeleteWikiPageCommand, void> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DeleteWikiPageCommand): Promise<void> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    const existing = await this.prisma.wikiPage.findFirst({ where: { id: command.pageId, workspaceId: command.workspaceId } });
    if (!existing) {
      throw new AppException('WIKI_PAGE_NOT_FOUND', 'Wiki page not found.', HttpStatus.NOT_FOUND);
    }
    if (existing.createdBy !== command.userId && !isModerator(role)) {
      throw new AppException('INSUFFICIENT_WORKSPACE_ROLE', 'Only the author or a Manager+ can delete this page.', HttpStatus.FORBIDDEN);
    }
    await this.prisma.wikiPage.delete({ where: { id: existing.id } });
  }
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export class SubmitReviewQueueItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: SubmitReviewQueueItemRequestDto,
  ) {}
}

@CommandHandler(SubmitReviewQueueItemCommand)
export class SubmitReviewQueueItemHandler implements ICommandHandler<SubmitReviewQueueItemCommand, ReviewQueueItemDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: SubmitReviewQueueItemCommand): Promise<ReviewQueueItemDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.data.workspaceId);
    const item = await this.prisma.reviewQueueItem.create({
      data: {
        workspaceId: command.data.workspaceId,
        resourceType: command.data.resourceType,
        resourceId: command.data.resourceId,
        submittedBy: command.userId,
        assignedTo: command.data.assignedTo ?? null,
        note: command.data.note ?? null,
      },
    });
    return toReviewQueueItemDto(item);
  }
}

export class DecideReviewQueueItemCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly itemId: string,
    public readonly data: DecideReviewQueueItemRequestDto,
  ) {}
}

@CommandHandler(DecideReviewQueueItemCommand)
export class DecideReviewQueueItemHandler implements ICommandHandler<DecideReviewQueueItemCommand, ReviewQueueItemDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: DecideReviewQueueItemCommand): Promise<ReviewQueueItemDto> {
    const { role } = await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    const existing = await this.prisma.reviewQueueItem.findFirst({ where: { id: command.itemId, workspaceId: command.workspaceId } });
    if (!existing) {
      throw new AppException('REVIEW_QUEUE_ITEM_NOT_FOUND', 'Review queue item not found.', HttpStatus.NOT_FOUND);
    }
    const isAssignee = existing.assignedTo === command.userId;
    if (!isAssignee && !isModerator(role)) {
      throw new AppException('INSUFFICIENT_WORKSPACE_ROLE', 'Only the assignee or a Manager+ can decide this review.', HttpStatus.FORBIDDEN);
    }
    if (existing.status !== 'PENDING') {
      throw new AppException('APPROVAL_REQUEST_ALREADY_DECIDED', 'This review item has already been decided.', HttpStatus.CONFLICT);
    }
    const updated = await this.prisma.reviewQueueItem.update({
      where: { id: existing.id },
      data: { status: command.data.status, note: command.data.note ?? existing.note, decidedAt: new Date() },
    });
    return toReviewQueueItemDto(updated);
  }
}

// ---------------------------------------------------------------------------
// Internal chat
// ---------------------------------------------------------------------------

export class CreateInternalChatChannelCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly data: CreateInternalChatChannelRequestDto,
  ) {}
}

@CommandHandler(CreateInternalChatChannelCommand)
export class CreateInternalChatChannelHandler
  implements ICommandHandler<CreateInternalChatChannelCommand, InternalChatChannelDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateInternalChatChannelCommand): Promise<InternalChatChannelDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.data.workspaceId);
    const channel = await this.prisma.internalChatChannel.create({
      data: {
        workspaceId: command.data.workspaceId,
        name: command.data.name,
        isPrivate: command.data.isPrivate ?? false,
        createdBy: command.userId,
      },
    });
    return toInternalChatChannelDto(channel);
  }
}

export class SendInternalChatMessageCommand implements ICommand {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly channelId: string,
    public readonly data: SendInternalChatMessageRequestDto,
  ) {}
}

@CommandHandler(SendInternalChatMessageCommand)
export class SendInternalChatMessageHandler
  implements ICommandHandler<SendInternalChatMessageCommand, InternalChatMessageDto>
{
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: SendInternalChatMessageCommand): Promise<InternalChatMessageDto> {
    await resolveWorkspaceMembership(this.prisma, command.userId, command.workspaceId);
    const channel = await this.prisma.internalChatChannel.findFirst({
      where: { id: command.channelId, workspaceId: command.workspaceId },
    });
    if (!channel) {
      throw new AppException('CHAT_CHANNEL_NOT_FOUND', 'Chat channel not found.', HttpStatus.NOT_FOUND);
    }
    const message = await this.prisma.internalChatMessage.create({
      data: { channelId: channel.id, authorId: command.userId, body: command.data.body },
    });
    return toInternalChatMessageDto(message);
  }
}
