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

/// Module 14 — Backup System. `organizationId` is optional in the path
/// (`"_system"` sentinel) for a Community Edition single-tenant install
/// triggering/listing full-system backups with no `Organization` row in
/// scope — see `BackupRunDto`'s doc comment.
export const BACKUP_RUN_ENDPOINTS = {
  list: (organizationId = "_system") => `/backups/${organizationId}/runs`,
  trigger: (organizationId = "_system") => `/backups/${organizationId}/runs`,
  get: (organizationId: string | undefined, id: string) => `/backups/${organizationId ?? "_system"}/runs/${id}`,
  download: (organizationId: string | undefined, id: string) => `/backups/${organizationId ?? "_system"}/runs/${id}/download`,
  restoreInstructions: (organizationId: string | undefined, id: string) =>
    `/backups/${organizationId ?? "_system"}/runs/${id}/restore-instructions`,
  verify: (organizationId: string | undefined, id: string) => `/backups/${organizationId ?? "_system"}/runs/${id}/verify`,
} as const;

export const COMPLIANCE_EXPORT_ENDPOINTS = {
  list: (organizationId: string) => `/enterprise/organizations/${organizationId}/compliance/exports`,
  create: (organizationId: string) => `/enterprise/organizations/${organizationId}/compliance/exports`,
  get: (organizationId: string, id: string) => `/enterprise/organizations/${organizationId}/compliance/exports/${id}`,
} as const;
