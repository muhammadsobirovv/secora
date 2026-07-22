export const INTEGRATION_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/integrations`,
  capabilities: "/integrations/capabilities",
  connect: (organizationId: string) => `/enterprise/organizations/${organizationId}/integrations`,
  update: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/integrations/${id}`,
  disconnect: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/integrations/${id}`,
  test: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/integrations/${id}/test`,
  execute: (organizationId: string, id: string) =>
    `/enterprise/organizations/${organizationId}/integrations/${id}/execute`,
  oauthStart: (organizationId: string) => `/enterprise/organizations/${organizationId}/integrations/oauth/start`,
  oauthComplete: (organizationId: string) =>
    `/enterprise/organizations/${organizationId}/integrations/oauth/complete`,
} as const;
