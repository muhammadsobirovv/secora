// Canonical HTTP routes for the Module 6 Bug Bounty Workspace resources.
// Mirrors the convention established by vuln-endpoints.ts / ai-endpoints.ts
// — every resource lives under the `/bugbounty` prefix, same as `/vuln`
// and `/recon` namespace their own modules.

export const BUGBOUNTY_PROGRAM_ENDPOINTS = {
  list: "/bugbounty/programs",
  create: "/bugbounty/programs",
  get: (id: string) => `/bugbounty/programs/${id}`,
  update: (id: string) => `/bugbounty/programs/${id}`,
  delete: (id: string) => `/bugbounty/programs/${id}`,
  import: "/bugbounty/programs/import",
  scope: (id: string) => `/bugbounty/programs/${id}/scope`,
  scopeItem: (id: string, scopeItemId: string) => `/bugbounty/programs/${id}/scope/${scopeItemId}`,
  classify: (id: string) => `/bugbounty/programs/${id}/scope/classify`,
  targets: (id: string) => `/bugbounty/programs/${id}/targets`,
  unlinkTarget: (id: string, targetId: string) => `/bugbounty/programs/${id}/targets/${targetId}`,
} as const;

export const BUGBOUNTY_ASSET_ENDPOINTS = {
  list: "/bugbounty/assets",
} as const;

export const BUGBOUNTY_FINDING_ENDPOINTS = {
  list: "/bugbounty/findings",
  create: "/bugbounty/findings",
  get: (id: string) => `/bugbounty/findings/${id}`,
  update: (id: string) => `/bugbounty/findings/${id}`,
  delete: (id: string) => `/bugbounty/findings/${id}`,
  transitionStage: (id: string) => `/bugbounty/findings/${id}/stage`,
  checkDuplicate: "/bugbounty/findings/duplicate-check",
} as const;

export const BUG_REPORT_ENDPOINTS = {
  list: "/bugbounty/reports",
  create: "/bugbounty/reports",
  get: (id: string) => `/bugbounty/reports/${id}`,
  update: (id: string) => `/bugbounty/reports/${id}`,
  delete: (id: string) => `/bugbounty/reports/${id}`,
  submit: (id: string) => `/bugbounty/reports/${id}/submit`,
  generateDraft: (id: string) => `/bugbounty/reports/${id}/draft`,
  render: (id: string) => `/bugbounty/reports/${id}/render`,
  export: (id: string) => `/bugbounty/reports/${id}/export`,
} as const;

export const PAYLOAD_LIBRARY_ENDPOINTS = {
  list: "/bugbounty/payloads",
  create: "/bugbounty/payloads",
  get: (id: string) => `/bugbounty/payloads/${id}`,
  update: (id: string) => `/bugbounty/payloads/${id}`,
  delete: (id: string) => `/bugbounty/payloads/${id}`,
  explain: (id: string) => `/bugbounty/payloads/${id}/explain`,
} as const;

export const KNOWLEDGE_BASE_ENDPOINTS = {
  list: "/bugbounty/knowledge-base",
  create: "/bugbounty/knowledge-base",
  get: (id: string) => `/bugbounty/knowledge-base/${id}`,
  update: (id: string) => `/bugbounty/knowledge-base/${id}`,
  delete: (id: string) => `/bugbounty/knowledge-base/${id}`,
} as const;

export const BOOKMARK_ENDPOINTS = {
  list: "/bugbounty/bookmarks",
  create: "/bugbounty/bookmarks",
  delete: (id: string) => `/bugbounty/bookmarks/${id}`,
} as const;

export const BUGBOUNTY_DASHBOARD_ENDPOINTS = {
  summary: "/bugbounty/dashboard",
  statistics: "/bugbounty/statistics",
} as const;

export const BUGBOUNTY_CALENDAR_ENDPOINTS = {
  list: "/bugbounty/calendar",
  create: "/bugbounty/calendar",
  get: (id: string) => `/bugbounty/calendar/${id}`,
  update: (id: string) => `/bugbounty/calendar/${id}`,
  delete: (id: string) => `/bugbounty/calendar/${id}`,
} as const;

export const BUGBOUNTY_NOTIFICATION_ENDPOINTS = {
  list: "/bugbounty/notifications",
  markRead: (id: string) => `/bugbounty/notifications/${id}/read`,
  markAllRead: "/bugbounty/notifications/read-all",
} as const;

export const BUGBOUNTY_SEARCH_ENDPOINTS = {
  search: "/bugbounty/search",
} as const;
