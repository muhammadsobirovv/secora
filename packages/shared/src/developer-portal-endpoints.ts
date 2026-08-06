// Module 13 — Developer Portal HTTP routes (task #291).

export const DEVELOPER_PORTAL_ENDPOINTS = {
  catalog: "/developer-portal/catalog",
  tryToolCall: (toolName: string) => `/developer-portal/tools/${toolName}/try`,
  usage: "/developer-portal/usage",
} as const;
