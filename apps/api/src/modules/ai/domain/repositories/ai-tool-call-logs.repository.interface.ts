export interface AiToolCallLogRecord {
  id: string;
  conversationId: string;
  messageId: string | null;
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: Date;
}

export interface CreateAiToolCallLogInput {
  conversationId: string;
  messageId?: string | null;
  toolName: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  errorMessage?: string | null;
  durationMs?: number | null;
}

export interface AiToolCallLogsRepository {
  create(input: CreateAiToolCallLogInput): Promise<AiToolCallLogRecord>;
  listForConversation(conversationId: string): Promise<AiToolCallLogRecord[]>;
  listForMessage(messageId: string): Promise<AiToolCallLogRecord[]>;
}

export const AI_TOOL_CALL_LOGS_REPOSITORY = Symbol(
  'AI_TOOL_CALL_LOGS_REPOSITORY',
);
