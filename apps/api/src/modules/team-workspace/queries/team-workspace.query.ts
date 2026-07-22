import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { InternalChatChannelDto, InternalChatMessageDto, ReviewQueueItemDto, WikiPageDto } from '@pentesthub/shared';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../../common/exceptions/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { resolveWorkspaceMembership } from '../../collaboration/workspace-membership.util.js';
import {
  toInternalChatChannelDto,
  toInternalChatMessageDto,
  toReviewQueueItemDto,
  toWikiPageDto,
} from '../mappers/to-team-workspace-dto.mapper.js';

// ---------------------------------------------------------------------------
// Wiki
// ---------------------------------------------------------------------------

export class ListWikiPagesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
  ) {}
}

@QueryHandler(ListWikiPagesQuery)
export class ListWikiPagesHandler implements IQueryHandler<ListWikiPagesQuery, WikiPageDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListWikiPagesQuery): Promise<WikiPageDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
    const pages = await this.prisma.wikiPage.findMany({ where: { workspaceId: query.workspaceId }, orderBy: { updatedAt: 'desc' } });
    return pages.map(toWikiPageDto);
  }
}

export class GetWikiPageQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly pageId: string,
  ) {}
}

@QueryHandler(GetWikiPageQuery)
export class GetWikiPageHandler implements IQueryHandler<GetWikiPageQuery, WikiPageDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetWikiPageQuery): Promise<WikiPageDto> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
    const page = await this.prisma.wikiPage.findFirst({ where: { id: query.pageId, workspaceId: query.workspaceId } });
    if (!page) {
      throw new AppException('WIKI_PAGE_NOT_FOUND', 'Wiki page not found.', HttpStatus.NOT_FOUND);
    }
    return toWikiPageDto(page);
  }
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export class ListReviewQueueItemsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly status?: string,
  ) {}
}

@QueryHandler(ListReviewQueueItemsQuery)
export class ListReviewQueueItemsHandler implements IQueryHandler<ListReviewQueueItemsQuery, ReviewQueueItemDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListReviewQueueItemsQuery): Promise<ReviewQueueItemDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
    const items = await this.prisma.reviewQueueItem.findMany({
      where: { workspaceId: query.workspaceId, ...(query.status ? { status: query.status as never } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return items.map(toReviewQueueItemDto);
  }
}

// ---------------------------------------------------------------------------
// Internal chat
// ---------------------------------------------------------------------------

export class ListInternalChatChannelsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
  ) {}
}

@QueryHandler(ListInternalChatChannelsQuery)
export class ListInternalChatChannelsHandler implements IQueryHandler<ListInternalChatChannelsQuery, InternalChatChannelDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListInternalChatChannelsQuery): Promise<InternalChatChannelDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
    const channels = await this.prisma.internalChatChannel.findMany({ where: { workspaceId: query.workspaceId }, orderBy: { createdAt: 'asc' } });
    return channels.map(toInternalChatChannelDto);
  }
}

export class ListInternalChatMessagesQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly workspaceId: string,
    public readonly channelId: string,
    public readonly limit: number = 100,
  ) {}
}

@QueryHandler(ListInternalChatMessagesQuery)
export class ListInternalChatMessagesHandler implements IQueryHandler<ListInternalChatMessagesQuery, InternalChatMessageDto[]> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ListInternalChatMessagesQuery): Promise<InternalChatMessageDto[]> {
    await resolveWorkspaceMembership(this.prisma, query.userId, query.workspaceId);
    const channel = await this.prisma.internalChatChannel.findFirst({ where: { id: query.channelId, workspaceId: query.workspaceId } });
    if (!channel) {
      throw new AppException('CHAT_CHANNEL_NOT_FOUND', 'Chat channel not found.', HttpStatus.NOT_FOUND);
    }
    const messages = await this.prisma.internalChatMessage.findMany({
      where: { channelId: channel.id },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.limit, 500),
    });
    return messages.map(toInternalChatMessageDto).reverse();
  }
}
