// Canonical HTTP routes for the Module 11 AI Chat prompt library.
// Mirrors the convention established by ai-endpoints.ts.

export const PROMPT_TEMPLATE_ENDPOINTS = {
  list: "/ai/prompt-templates",
  create: "/ai/prompt-templates",
  update: (id: string) => `/ai/prompt-templates/${id}`,
  delete: (id: string) => `/ai/prompt-templates/${id}`,
  // Module 13 — Prompt Registry additions (task #280).
  versions: (id: string) => `/ai/prompt-templates/${id}/versions`,
  createVersion: (id: string) => `/ai/prompt-templates/${id}/versions`,
  test: (id: string) => `/ai/prompt-templates/${id}/test`,
  testRuns: (id: string) => `/ai/prompt-templates/${id}/test-runs`,
  rateTestRun: (id: string, runId: string) => `/ai/prompt-templates/${id}/test-runs/${runId}/rate`,
  export: "/ai/prompt-templates/export",
  import: "/ai/prompt-templates/import",
} as const;
