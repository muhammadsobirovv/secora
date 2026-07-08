// Canonical HTTP routes for the Module 2 Workspace Foundation resources.
// Mirrors the convention established by auth-endpoints.ts.

export const WORKSPACE_ENDPOINTS = {
  get: "/workspace",
  update: "/workspace",
  uploadAvatar: "/workspace/avatar",
  settings: "/workspace/settings",
  members: "/workspace/members",
} as const;

export const PROJECT_ENDPOINTS = {
  list: "/projects",
  create: "/projects",
  get: (id: string) => `/projects/${id}`,
  update: (id: string) => `/projects/${id}`,
  archive: (id: string) => `/projects/${id}/archive`,
  restore: (id: string) => `/projects/${id}/restore`,
  delete: (id: string) => `/projects/${id}`,
  favorite: (id: string) => `/projects/${id}/favorite`,
  unfavorite: (id: string) => `/projects/${id}/favorite`,
  members: (id: string) => `/projects/${id}/members`,
  removeMember: (id: string, userId: string) => `/projects/${id}/members/${userId}`,
  tag: (id: string, tagId: string) => `/projects/${id}/tags/${tagId}`,
  attachments: (id: string) => `/projects/${id}/attachments`,
} as const;

export const TARGET_ENDPOINTS = {
  list: (projectId: string) => `/projects/${projectId}/targets`,
  create: (projectId: string) => `/projects/${projectId}/targets`,
  get: (id: string) => `/targets/${id}`,
  update: (id: string) => `/targets/${id}`,
  delete: (id: string) => `/targets/${id}`,
  tag: (id: string, tagId: string) => `/targets/${id}/tags/${tagId}`,
  attachments: (id: string) => `/targets/${id}/attachments`,
} as const;

export const NOTE_ENDPOINTS = {
  list: (projectId: string) => `/projects/${projectId}/notes`,
  create: (projectId: string) => `/projects/${projectId}/notes`,
  get: (id: string) => `/notes/${id}`,
  update: (id: string) => `/notes/${id}`,
  delete: (id: string) => `/notes/${id}`,
  attachments: (id: string) => `/notes/${id}/attachments`,
} as const;

export const EVIDENCE_ENDPOINTS = {
  list: (projectId: string) => `/projects/${projectId}/evidence`,
  create: (projectId: string) => `/projects/${projectId}/evidence`,
  get: (id: string) => `/evidence/${id}`,
  update: (id: string) => `/evidence/${id}`,
  delete: (id: string) => `/evidence/${id}`,
  attachments: (id: string) => `/evidence/${id}/attachments`,
} as const;

export const TAG_ENDPOINTS = {
  list: "/tags",
  create: "/tags",
  delete: (id: string) => `/tags/${id}`,
} as const;

export const ACTIVITY_ENDPOINTS = {
  list: "/activity",
} as const;

export const SEARCH_ENDPOINTS = {
  search: "/search",
} as const;
