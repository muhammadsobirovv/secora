// Module 13 — Local Execution HTTP routes.

export const RELAY_COMMAND_ENDPOINTS = {
  pending: "/relay-commands/pending",
  complete: (id: string) => `/relay-commands/${id}/complete`,
} as const;
