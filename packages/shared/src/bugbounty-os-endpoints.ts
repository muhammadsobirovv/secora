// Canonical HTTP routes for Module 9's new subsystems (Collaboration,
// Automation, Notification Channels, Analytics, Public API). Mirrors the
// convention established by bugbounty-endpoints.ts.

export const COLLABORATION_INVITE_ENDPOINTS = {
  list: "/collaboration/invites",
  create: "/collaboration/invites",
  revoke: (id: string) => `/collaboration/invites/${id}`,
  accept: "/collaboration/invites/accept",
} as const;

export const WORKSPACE_MEMBER_ROLE_ENDPOINTS = {
  updateRole: (userId: string) => `/collaboration/members/${userId}/role`,
  remove: (userId: string) => `/collaboration/members/${userId}`,
} as const;

export const COMMENT_ENDPOINTS = {
  list: "/collaboration/comments",
  create: "/collaboration/comments",
  update: (id: string) => `/collaboration/comments/${id}`,
  delete: (id: string) => `/collaboration/comments/${id}`,
} as const;

export const MENTION_ENDPOINTS = {
  list: "/collaboration/mentions",
  markRead: (id: string) => `/collaboration/mentions/${id}/read`,
} as const;

export const ASSIGNMENT_ENDPOINTS = {
  list: "/collaboration/assignments",
  create: "/collaboration/assignments",
  update: (id: string) => `/collaboration/assignments/${id}`,
  delete: (id: string) => `/collaboration/assignments/${id}`,
} as const;

export const TASK_ITEM_ENDPOINTS = {
  list: "/collaboration/tasks",
  create: "/collaboration/tasks",
  update: (id: string) => `/collaboration/tasks/${id}`,
  delete: (id: string) => `/collaboration/tasks/${id}`,
} as const;

export const ACTIVITY_FEED_ENDPOINTS = {
  list: "/collaboration/activity",
} as const;

export const SCHEDULED_JOB_ENDPOINTS = {
  list: "/automation/scheduled-jobs",
  create: "/automation/scheduled-jobs",
  get: (id: string) => `/automation/scheduled-jobs/${id}`,
  update: (id: string) => `/automation/scheduled-jobs/${id}`,
  delete: (id: string) => `/automation/scheduled-jobs/${id}`,
  runs: (id: string) => `/automation/scheduled-jobs/${id}/runs`,
  runNow: (id: string) => `/automation/scheduled-jobs/${id}/run-now`,
} as const;

export const NOTIFICATION_CHANNEL_ENDPOINTS = {
  list: "/notifications/channels",
  create: "/notifications/channels",
  update: (id: string) => `/notifications/channels/${id}`,
  delete: (id: string) => `/notifications/channels/${id}`,
  test: (id: string) => `/notifications/channels/${id}/test`,
} as const;

export const API_KEY_ENDPOINTS = {
  list: "/public-api/keys",
  create: "/public-api/keys",
  revoke: (id: string) => `/public-api/keys/${id}`,
  /// Module 15 — API key management (task #336). Previously missing here
  /// even though `ApiKeysController.rotate()` has always exposed the
  /// route — this constant just had no frontend consumer before Module 20
  /// built the API Keys settings page.
  rotate: (id: string) => `/public-api/keys/${id}/rotate`,
} as const;

// Module 10 fix: these were previously workspace-agnostic paths
// ("/public-api/webhooks/...") that didn't match
// WebhookTokensController's actual route
// (`public-api/workspaces/:workspaceId/webhooks`) — a pre-existing drift
// with no caller (unused in apps/, confirmed via repo-wide search), so
// correcting it here breaks nothing. Also adds the Module 10 delivery
// log + redelivery routes.
export const WEBHOOK_TOKEN_ENDPOINTS = {
  list: (workspaceId: string) => `/public-api/workspaces/${workspaceId}/webhooks`,
  create: (workspaceId: string) => `/public-api/workspaces/${workspaceId}/webhooks`,
  update: (workspaceId: string, id: string) => `/public-api/workspaces/${workspaceId}/webhooks/${id}`,
  delete: (workspaceId: string, id: string) => `/public-api/workspaces/${workspaceId}/webhooks/${id}`,
  test: (workspaceId: string, id: string) => `/public-api/workspaces/${workspaceId}/webhooks/${id}/test`,
  listDeliveries: (workspaceId: string, id: string) =>
    `/public-api/workspaces/${workspaceId}/webhooks/${id}/deliveries`,
  redeliver: (workspaceId: string, id: string, deliveryId: string) =>
    `/public-api/workspaces/${workspaceId}/webhooks/${id}/deliveries/${deliveryId}/redeliver`,
} as const;

export const ANALYTICS_ENDPOINTS = {
  overview: "/bugbounty/analytics",
} as const;

export const CVSS_ENDPOINTS = {
  calculate: "/bugbounty/cvss/calculate",
} as const;

export const AI_BUGBOUNTY_ASSISTANT_ENDPOINTS = {
  reviewFinding: (findingId: string) => `/bugbounty/findings/${findingId}/ai/review`,
  suggestPayloads: (findingId: string) => `/bugbounty/findings/${findingId}/ai/suggest-payloads`,
  generatePoc: (findingId: string) => `/bugbounty/findings/${findingId}/ai/generate-poc`,
  generateReproSteps: (findingId: string) => `/bugbounty/findings/${findingId}/ai/generate-repro-steps`,
  generateImpact: (findingId: string) => `/bugbounty/findings/${findingId}/ai/generate-impact`,
  generateRemediation: (findingId: string) => `/bugbounty/findings/${findingId}/ai/generate-remediation`,
  calculateSeverity: (findingId: string) => `/bugbounty/findings/${findingId}/ai/calculate-severity`,
  suggestAttackPaths: "/bugbounty/ai/suggest-attack-paths",
  summarizeEngagement: "/bugbounty/ai/summarize-engagement",
  correctGrammar: (reportId: string) => `/bugbounty/reports/${reportId}/ai/correct-grammar`,
  reviewReportQuality: (reportId: string) => `/bugbounty/reports/${reportId}/ai/review-quality`,
} as const;
