import type { AiConversationDto } from '@pentesthub/shared';
import type { AiConversationListItem } from '../domain/repositories/ai-conversations.repository.interface.js';

export function toAiConversationDto(
  conversation: AiConversationListItem,
): AiConversationDto {
  return {
    id: conversation.id,
    workspaceId: conversation.workspaceId,
    projectId: conversation.projectId,
    userId: conversation.userId,
    title: conversation.title,
    provider: conversation.provider,
    model: conversation.model,
    pinned: conversation.pinned,
    archivedAt: conversation.archivedAt?.toISOString() ?? null,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    messageCount: conversation.messageCount,
    lastMessagePreview: conversation.lastMessagePreview,
  };
}
