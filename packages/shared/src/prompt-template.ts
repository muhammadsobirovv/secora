// Module 11 — AI Chat prompt library / conversation templates.
// A workspace-scoped, reusable prompt a user can save and re-insert into a
// new or existing conversation. "Conversation templates" (spec'd alongside
// "Prompt library" under AI Chat) reuse this same model — a template is
// just a PromptTemplate whose `category` is "conversation" instead of
// e.g. "recon" / "report-writing" — rather than a second, near-identical
// table.

export interface PromptTemplateDto {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  promptText: string;
  category: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromptTemplateRequestDto {
  name: string;
  description?: string;
  promptText: string;
  category?: string;
}

export interface UpdatePromptTemplateRequestDto {
  name?: string;
  description?: string;
  promptText?: string;
  category?: string;
}

export interface ListPromptTemplatesQueryDto {
  category?: string;
  search?: string;
}
