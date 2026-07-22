import type { InternalChatChannelDto, InternalChatMessageDto, ReviewQueueItemDto, WikiPageDto } from '@pentesthub/shared';
import type { InternalChatChannel, InternalChatMessage, ReviewQueueItem, WikiPage } from '../../../prisma-types.js';

export function toWikiPageDto(row: WikiPage): WikiPageDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    parentPageId: row.parentPageId,
    title: row.title,
    contentMarkdown: row.contentMarkdown,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toReviewQueueItemDto(row: ReviewQueueItem): ReviewQueueItemDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    submittedBy: row.submittedBy,
    assignedTo: row.assignedTo,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

export function toInternalChatChannelDto(row: InternalChatChannel): InternalChatChannelDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    name: row.name,
    isPrivate: row.isPrivate,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toInternalChatMessageDto(row: InternalChatMessage): InternalChatMessageDto {
  return {
    id: row.id,
    channelId: row.channelId,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}
