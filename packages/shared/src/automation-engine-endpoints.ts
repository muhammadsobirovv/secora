// Module 10 — Automation Engine. Org-scoped, matching the same
// `/enterprise/organizations/:organizationId/...` convention as
// distributed-jobs/plugin-installations/enterprise-reporting.
export const WORKFLOW_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/workflows`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/workflows`,
  get: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/workflows/${id}`,
  update: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/workflows/${id}`,
  delete: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/workflows/${id}`,
  trigger: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/workflows/${id}/trigger`,
  listRuns: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/workflows/${id}/runs`,
  getRun: (organizationId: string, id: string, runId: string) =>
    `/enterprise/organizations/${organizationId}/workflows/${id}/runs/${runId}`,
  cancelRun: (organizationId: string, id: string, runId: string) =>
    `/enterprise/organizations/${organizationId}/workflows/${id}/runs/${runId}/cancel`,
} as const;
