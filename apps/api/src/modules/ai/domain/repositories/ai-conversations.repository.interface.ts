import type { AiProviderName } from '@pentesthub/shared';

export interface AiConversationRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  userId: string;
  title: string | null;
  provider: AiProviderName | null;
  model: string | null;
  pinned: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAiConversationInput {
  workspaceId: string;
  projectId: string;
  userId: string;
  title?: string | null;
  provider?: AiProviderName | null;
  model?: string | null;
}

export interface ListAiConversationsFilter {
  workspaceId: string;
  projectId?: string;
  userId?: string;
  search?: string;
  pinned?: boolean;
  includeArchived?: boolean;
  limit?: number;
}

/// `messageCount`/`lastMessagePreview` are read-model conveniences the
/// repository computes (via a join/aggregate), not stored columns — kept
/// out of AiConversationRecord itself so command handlers that only need
/// to mutate a conversation never pay for the aggregate.
export interface AiConversationListItem extends AiConversationRecord {
  messageCount: number;
  lastMessagePreview: string | null;
}

export interface AiConversationsRepository {
  create(input: CreateAiConversationInput): Promise<AiConversationRecord>;
  findById(id: string): Promise<AiConversationRecord | null>;
  list(filter: ListAiConversationsFilter): Promise<AiConversationListItem[]>;
  setPinned(id: string, pinned: boolean): Promise<AiConversationRecord>;
  setArchived(id: string, archived: boolean): Promise<AiConversationRecord>;
  touch(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export const AI_CONVERSATIONS_REPOSITORY = Symbol(
  'AI_CONVERSATIONS_REPOSITORY',
);
