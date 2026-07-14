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
} as const;

export const AI_MESSAGE_ENDPOINTS = {
  bookmark: (messageId: string) => `/ai/messages/${messageId}/bookmark`,
  pin: (messageId: string) => `/ai/messages/${messageId}/pin`,
  delete: (messageId: string) => `/ai/messages/${messageId}`,
} as const;

export const AI_PROVIDER_ENDPOINTS = {
  list: "/ai/providers",
} as const;

export const AI_SPEECH_ENDPOINTS = {
  list: "/ai/speech/providers",
} as const;

export const AI_CONTEXT_ENDPOINTS = {
  summary: (projectId: string) => `/ai/context/${projectId}`,
  suggestedQuestions: (projectId: string) => `/ai/context/${projectId}/suggested-questions`,
} as const;

export const AI_MEMORY_ENDPOINTS = {
  search: "/ai/memory/search",
  reindex: (projectId: string) => `/ai/memory/${projectId}/reindex`,
} as const;
