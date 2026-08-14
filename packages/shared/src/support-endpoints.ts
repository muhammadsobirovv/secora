// Module 15 — Support system (task #355).
export const SUPPORT_ENDPOINTS = {
  // Deliberately public — a signed-out visitor troubleshooting a login
  // problem is exactly who most needs to reach support without a token.
  createTicket: () => "/support/tickets",
  // Authenticated-only: a submitter's own ticket history.
  myTickets: () => "/support/tickets/mine",
} as const;
