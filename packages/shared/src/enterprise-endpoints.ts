// Canonical HTTP routes for Module 10's Enterprise Platform surface
// (multi-tenant Organizations/Departments/Teams + RBAC/ABAC). Mirrors the
// convention established by bugbounty-os-endpoints.ts.

export const ORGANIZATION_ENDPOINTS = {
  list: "/enterprise/organizations",
  create: "/enterprise/organizations",
  get: (id: string) => `/enterprise/organizations/${id}`,
  update: (id: string) => `/enterprise/organizations/${id}`,
  settings: (id: string) => `/enterprise/organizations/${id}/settings`,
  quota: (id: string) => `/enterprise/organizations/${id}/quota`,
} as const;

export const ORGANIZATION_MEMBER_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/members`,
  updateRole: (organizationId: string, userId: string) =>
    `/enterprise/organizations/${organizationId}/members/${userId}/role`,
  remove: (organizationId: string, userId: string) =>
    `/enterprise/organizations/${organizationId}/members/${userId}`,
} as const;

export const ORGANIZATION_INVITE_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/invites`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/invites`,
  revoke: (organizationId: string, inviteId: string) =>
    `/enterprise/organizations/${organizationId}/invites/${inviteId}`,
  accept: "/enterprise/organizations/invites/accept",
} as const;

export const DEPARTMENT_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/departments`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/departments`,
  update: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/departments/${id}`,
  delete: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/departments/${id}`,
} as const;

export const TEAM_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/teams`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/teams`,
  update: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/teams/${id}`,
  delete: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/teams/${id}`,
  addMember: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/teams/${id}/members`,
  removeMember: (organizationId: string, id: string, organizationMemberId: string) =>
    `/enterprise/organizations/${organizationId}/teams/${id}/members/${organizationMemberId}`,
} as const;

export const CUSTOM_ROLE_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/custom-roles`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/custom-roles`,
} as const;

export const PERMISSION_GROUP_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/permission-groups`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/permission-groups`,
} as const;

export const RESOURCE_PERMISSION_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/resource-permissions`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/resource-permissions`,
  delete: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/rbac/resource-permissions/${id}`,
} as const;

export const TEMPORARY_PERMISSION_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/temporary-permissions`,
  grant: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/temporary-permissions`,
  revoke: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/rbac/temporary-permissions/${id}`,
} as const;

export const APPROVAL_WORKFLOW_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/approval-workflows`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/approval-workflows`,
} as const;

export const APPROVAL_REQUEST_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/approval-requests`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/rbac/approval-requests`,
  decide: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/rbac/approval-requests/${id}/decide`,
} as const;
