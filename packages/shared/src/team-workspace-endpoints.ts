// Team Workspace resources are workspace-scoped (Prisma `workspaceId` is
// required; `organizationId` is only an optional cross-team pointer) — so
// routes are workspace-explicit under `/team-workspace/workspaces/:workspaceId/...`,
// the same routing shape Module 9's Collaboration surface uses
// (`/collaboration/workspaces/:workspaceId/...`), not organization-scoped.

export const WIKI_PAGE_ENDPOINTS = {
  list: (workspaceId: string) => `/team-workspace/workspaces/${workspaceId}/wiki-pages`,
  create: (workspaceId: string) => `/team-workspace/workspaces/${workspaceId}/wiki-pages`,
  get: (workspaceId: string, id: string) => `/team-workspace/workspaces/${workspaceId}/wiki-pages/${id}`,
  update: (workspaceId: string, id: string) => `/team-workspace/workspaces/${workspaceId}/wiki-pages/${id}`,
  remove: (workspaceId: string, id: string) => `/team-workspace/workspaces/${workspaceId}/wiki-pages/${id}`,
} as const;

export const REVIEW_QUEUE_ENDPOINTS = {
  list: (workspaceId: string) => `/team-workspace/workspaces/${workspaceId}/review-queue`,
  submit: (workspaceId: string) => `/team-workspace/workspaces/${workspaceId}/review-queue`,
  decide: (workspaceId: string, id: string) => `/team-workspace/workspaces/${workspaceId}/review-queue/${id}/decide`,
} as const;

export const INTERNAL_CHAT_ENDPOINTS = {
  listChannels: (workspaceId: string) => `/team-workspace/workspaces/${workspaceId}/chat/channels`,
  createChannel: (workspaceId: string) => `/team-workspace/workspaces/${workspaceId}/chat/channels`,
  listMessages: (workspaceId: string, channelId: string) =>
    `/team-workspace/workspaces/${workspaceId}/chat/channels/${channelId}/messages`,
  sendMessage: (workspaceId: string, channelId: string) =>
    `/team-workspace/workspaces/${workspaceId}/chat/channels/${channelId}/messages`,
} as const;
