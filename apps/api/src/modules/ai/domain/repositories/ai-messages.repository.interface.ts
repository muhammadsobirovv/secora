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
  update(id: string, data: UpdateAiMessageInput): Promise<AiMessageRecord>;
  setBookmarked(id: string, bookmarked: boolean): Promise<AiMessageRecord>;
  setPinned(id: string, pinned: boolean): Promise<AiMessageRecord>;
  delete(id: string): Promise<void>;
}

export const AI_MESSAGES_REPOSITORY = Symbol('AI_MESSAGES_REPOSITORY');
