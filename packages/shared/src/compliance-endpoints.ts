export const DATA_RETENTION_POLICY_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/compliance/retention-policies`,
  upsert: (organizationId: string) => `/enterprise/organizations/${organizationId}/compliance/retention-policies`,
  delete: (organizationId: string, resourceType: string) =>
    `/enterprise/organizations/${organizationId}/compliance/retention-policies/${resourceType}`,
} as const;

export const BACKUP_POLICY_ENDPOINTS = {
  get: (organizationId: string) => `/enterprise/organizations/${organizationId}/compliance/backup-policy`,
  upsert: (organizationId: string) => `/enterprise/organizations/${organizationId}/compliance/backup-policy`,
} as const;

export const COMPLIANCE_EXPORT_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/compliance/exports`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/compliance/exports`,
  get: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/compliance/exports/${id}`,
} as const;
