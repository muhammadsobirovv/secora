// Canonical HTTP routes for the Module 11 AI Knowledge Base reference
// catalog. Mirrors the convention established by ai-endpoints.ts.

export const KNOWLEDGE_BASE_REFERENCE_ENDPOINTS = {
  list: "/knowledge-base/references",
  search: "/knowledge-base/references/search",
  get: (id: string) => `/knowledge-base/references/${id}`,
  upsert: "/knowledge-base/references",
  delete: (id: string) => `/knowledge-base/references/${id}`,
  /// Module 11 — Controllers + Swagger + module wiring + events (task
  /// #236): opt-in fold of the whole catalog into this workspace's RAG
  /// store — see KnowledgeBaseReferenceService.reindexForSemanticSearch.
  reindex: "/knowledge-base/references/reindex",
} as const;
