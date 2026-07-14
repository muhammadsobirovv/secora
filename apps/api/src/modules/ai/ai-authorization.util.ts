import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception.js';
import type {
  AiConversationRecord,
  AiConversationsRepository,
} from './domain/repositories/ai-conversations.repository.interface.js';
import {
  WORKSPACES_REPOSITORY,
  type WorkspacesRepository,
} from '../workspaces/domain/repositories/workspaces.repository.interface.js';

/// Shared "resolve + authorize" check every command/query handler that
/// acts on an existing conversation goes through — same
/// enumeration-safe-404 pattern as resolveVulnScanJobForCaller (Module
/// 4): a conversation that doesn't exist and one that belongs to another
/// workspace both resolve to the same NOT_FOUND, so a caller can't probe
/// for the existence of another workspace's conversations (Security:
/// Workspace Isolation).
export async function resolveAiConversationForCaller(
  conversationsRepository: AiConversationsRepository,
  workspacesRepository: WorkspacesRepository,
  userId: string,
  conversationId: string,
): Promise<AiConversationRecord> {
  const workspace =
    await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException(
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const conversation = await conversationsRepository.findById(conversationId);
  if (!conversation || conversation.workspaceId !== workspace.id) {
    throw new AppException(
      'AI_CONVERSATION_NOT_FOUND',
      'Conversation not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return conversation;
}

export async function resolveAiMessageForCaller(
  conversationsRepository: AiConversationsRepository,
  messagesRepository: import('./domain/repositories/ai-messages.repository.interface.js').AiMessagesRepository,
  workspacesRepository: WorkspacesRepository,
  userId: string,
  messageId: string,
): Promise<{
  message: import('./domain/repositories/ai-messages.repository.interface.js').AiMessageRecord;
  conversation: AiConversationRecord;
}> {
  const workspace =
    await workspacesRepository.findPersonalWorkspaceForUser(userId);
  if (!workspace) {
    throw new AppException(
      'WORKSPACE_NOT_FOUND',
      'Workspace not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const message = await messagesRepository.findById(messageId);
  if (!message) {
    throw new AppException(
      'AI_MESSAGE_NOT_FOUND',
      'Message not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  const conversation = await conversationsRepository.findById(
    message.conversationId,
  );
  if (!conversation || conversation.workspaceId !== workspace.id) {
    throw new AppException(
      'AI_MESSAGE_NOT_FOUND',
      'Message not found.',
      HttpStatus.NOT_FOUND,
    );
  }
  return { message, conversation };
}

export { WORKSPACES_REPOSITORY, type WorkspacesRepository };
