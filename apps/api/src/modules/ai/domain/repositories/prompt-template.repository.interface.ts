export interface PromptTemplateRecord {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  promptText: string;
  category: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePromptTemplateInput {
  workspaceId: string;
  name: string;
  description?: string | null;
  promptText: string;
  category?: string | null;
  createdBy: string;
}

export interface UpdatePromptTemplateInput {
  name?: string;
  description?: string | null;
  promptText?: string;
  category?: string | null;
}

export interface ListPromptTemplatesFilter {
  workspaceId: string;
  category?: string;
  /// Case-insensitive substring match against name/description/promptText
  /// — same "search" shape as every other list-with-search filter in the
  /// codebase (e.g. ListAiConversationsQuery's own `search`).
  search?: string;
}

/// AI Chat's Prompt Library / Conversation Templates (task #230). Raw SQL
/// throughout — PromptTemplate was added by the same hand-applied
/// migration (20260601000000_ai_multi_agent_system) as OrchestrationRun/
/// AgentTask/KnowledgeBaseReferenceEntry, so it has no generated Prisma
/// Client support either; see PrismaAgentOrchestrationRepository's doc
/// comment for the full reasoning.
export interface PromptTemplateRepository {
  create(input: CreatePromptTemplateInput): Promise<PromptTemplateRecord>;
  findById(id: string): Promise<PromptTemplateRecord | null>;
  list(filter: ListPromptTemplatesFilter): Promise<PromptTemplateRecord[]>;
  update(id: string, data: UpdatePromptTemplateInput): Promise<PromptTemplateRecord>;
  delete(id: string): Promise<void>;
}

export const PROMPT_TEMPLATE_REPOSITORY = Symbol('PROMPT_TEMPLATE_REPOSITORY');
