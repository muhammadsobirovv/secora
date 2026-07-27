import type {
  AiMessageRole,
  AiMessageStatus,
  AiProviderName,
} from '@pentesthub/shared';

export interface AiMessageRecord {
  id: string;
  conversationId: string;
  role: AiMessageRole;
  content: string;
  status: AiMessageStatus;
  provider: AiProviderName | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  bookmarked: boolean;
  pinned: boolean;
  errorMessage: string | null;
  /// Module 11 — AI Chat conversation branching. See the matching doc
  /// comment on AiMessageDto in packages/shared/src/ai.ts.
  parentMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAiMessageInput {
  conversationId: string;
  role: AiMessageRole;
  content: string;
  status?: AiMessageStatus;
  provider?: AiProviderName | null;
  model?: string | null;
  /// Module 11 — set when this message forks off an earlier one instead of
  /// appending to the conversation trunk.
  parentMessageId?: string | null;
}

export interface UpdateAiMessageInput {
  content?: string;
  status?: AiMessageStatus;
  promptTokens?: number | null;
  completionTokens?: number | null;
  errorMessage?: string | null;
}

export interface AiMessagesRepository {
  create(input: CreateAiMessageInput): Promise<AiMessageRecord>;
  findById(id: string): Promise<AiMessageRecord | null>;
  listForConversation(conversationId: string): Promise<AiMessageRecord[]>;
  /// Module 11 — AI Chat conversation branching: direct replies to a
  /// given message, oldest first.
  listBranches(parentMessageId: string): Promise<AiMessageRecord[]>;
  update(id: string, data: UpdateAiMessageInput): Promise<AiMessageRecord>;
  setBookmarked(id: string, bookmarked: boolean): Promise<AiMessageRecord>;
  setPinned(id: string, pinned: boolean): Promise<AiMessageRecord>;
  delete(id: string): Promise<void>;
}

export const AI_MESSAGES_REPOSITORY = Symbol('AI_MESSAGES_REPOSITORY');
