// Canonical HTTP routes for the Module 11 AI Chat prompt library.
// Mirrors the convention established by ai-endpoints.ts.

export const PROMPT_TEMPLATE_ENDPOINTS = {
  list: "/ai/prompt-templates",
  create: "/ai/prompt-templates",
  update: (id: string) => `/ai/prompt-templates/${id}`,
  delete: (id: string) => `/ai/prompt-templates/${id}`,
} as const;
