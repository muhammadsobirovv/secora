// Module 13 — Script Engine HTTP routes.

export const SCRIPT_ENGINE_ENDPOINTS = {
  list: "/scripts",
  create: "/scripts",
  get: (id: string) => `/scripts/${id}`,
  update: (id: string) => `/scripts/${id}`,
  delete: (id: string) => `/scripts/${id}`,
  run: (id: string) => `/scripts/${id}/run`,
  executions: (id: string) => `/scripts/${id}/executions`,
  getExecution: (id: string, executionId: string) => `/scripts/${id}/executions/${executionId}`,
} as const;
