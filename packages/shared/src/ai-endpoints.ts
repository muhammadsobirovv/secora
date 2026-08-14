// Canonical HTTP routes for the Module 5 AI Security Copilot resources.
// Mirrors the convention established by vuln-endpoints.ts.

export const AI_CONVERSATION_ENDPOINTS = {
  list: "/ai/conversations",
  create: "/ai/conversations",
  get: (id: string) => `/ai/conversations/${id}`,
  delete: (id: string) => `/ai/conversations/${id}`,
  pin: (id: string) => `/ai/conversations/${id}/pin`,
  archive: (id: string) => `/ai/conversations/${id}/archive`,
  sendMessage: (id: string) => `/ai/conversations/${id}/messages`,
  streamMessage: (id: string) => `/ai/conversations/${id}/messages/stream`,
  regenerate: (id: string) => `/ai/conversations/${id}/messages/regenerate`,
  cancel: (id: string) => `/ai/conversations/${id}/messages/cancel`,
  continue: (id: string) => `/ai/conversations/${id}/messages/continue`,
  /// Module 11 — AI Chat conversation branching.
  branch: (id: string) => `/ai/conversations/${id}/messages/branch`,
  listBranches: (conversationId: string, messageId: string) =>
    `/ai/conversations/${conversationId}/messages/${messageId}/branches`,
} as const;

export const AI_MESSAGE_ENDPOINTS = {
  bookmark: (messageId: string) => `/ai/messages/${messageId}/bookmark`,
  pin: (messageId: string) => `/ai/messages/${messageId}/pin`,
  delete: (messageId: string) => `/ai/messages/${messageId}`,
} as const;

export const AI_PROVIDER_ENDPOINTS = {
  list: "/ai/providers",
  /// Module 15 — AI provider marketplace (BYOK expansion, task #341).
  marketplace: "/ai/providers/marketplace",
} as const;

/// Local-First Migration Phase 1 (BYOK) — one credential row per
/// (workspace, provider); `provider` in the path is the AiProviderName
/// (e.g. "OPENAI").
export const AI_PROVIDER_CREDENTIAL_ENDPOINTS = {
  list: "/ai/provider-credentials",
  upsert: (provider: string) => `/ai/provider-credentials/${provider}`,
  delete: (provider: string) => `/ai/provider-credentials/${provider}`,
} as const;

export const AI_SPEECH_ENDPOINTS = {
  list: "/ai/speech/providers",
  /// Module 11 — Voice Copilot enhancements.
  transcribe: "/ai/speech/transcribe",
  synthesize: "/ai/speech/synthesize",
} as const;

export const AI_CONTEXT_ENDPOINTS = {
  summary: (projectId: string) => `/ai/context/${projectId}`,
  suggestedQuestions: (projectId: string) => `/ai/context/${projectId}/suggested-questions`,
} as const;

export const AI_MEMORY_ENDPOINTS = {
  search: "/ai/memory/search",
  reindex: (projectId: string) => `/ai/memory/${projectId}/reindex`,
} as const;

/// Module 11 — Privacy controls (task #234): per-workspace AI privacy mode.
export const AI_PRIVACY_ENDPOINTS = {
  get: "/ai/privacy-mode",
  update: "/ai/privacy-mode",
} as const;
