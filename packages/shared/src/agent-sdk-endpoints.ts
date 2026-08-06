// Module 13 — AI Agent SDK HTTP routes.

export const AGENT_SDK_ENDPOINTS = {
  list: "/agent-sdk/definitions",
  register: "/agent-sdk/definitions",
  get: (id: string) => `/agent-sdk/definitions/${id}`,
  update: (id: string) => `/agent-sdk/definitions/${id}`,
  delete: (id: string) => `/agent-sdk/definitions/${id}`,
  runs: "/agent-sdk/runs",
  startRun: "/agent-sdk/runs",
  getRun: (id: string) => `/agent-sdk/runs/${id}`,
  cancelRun: (id: string) => `/agent-sdk/runs/${id}/cancel`,
} as const;
