// Canonical HTTP routes for the Module 11 Master AI Orchestrator + agent
// framework. Mirrors the convention established by ai-endpoints.ts.

export const AGENT_ORCHESTRATION_ENDPOINTS = {
  list: "/agent/runs",
  create: "/agent/runs",
  get: (id: string) => `/agent/runs/${id}`,
  stream: (id: string) => `/agent/runs/${id}/stream`,
  cancel: (id: string) => `/agent/runs/${id}/cancel`,
  retry: (id: string) => `/agent/runs/${id}/retry`,
  /// Module 11 — Controllers + Swagger + module wiring + events (task
  /// #236): AgentExplainabilityService.explainRun's HTTP surface.
  explain: (id: string) => `/agent/runs/${id}/explain`,
} as const;

export const AGENT_TASK_ENDPOINTS = {
  get: (id: string) => `/agent/tasks/${id}`,
  cancel: (id: string) => `/agent/tasks/${id}/cancel`,
} as const;
