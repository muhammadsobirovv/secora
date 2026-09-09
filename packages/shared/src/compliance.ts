// Module 10 — Compliance. Types for `DataRetentionPolicy`/`BackupPolicy`/
// `ComplianceExportRequest`. See docs/adr/0010-enterprise-platform.md.

/// Resource types the retention enforcer (apps/api/src/modules/
/// compliance/services/data-retention-enforcer.service.ts) actually
/// knows how to delete automatically today. A policy may be created for
/// any free-text `resourceType`, but only these two are wired to real
/// automatic deletion — anything else is recorded and enforced manually
/// until a future pass adds it (the same disclosed-narrower-v1-scope
/// pattern used throughout Module 10; see that service's doc comment).
export const AUTO_ENFORCEABLE_RETENTION_RESOURCE_TYPES = [
  "API_REQUEST_LOG",
  "WEBHOOK_DELIVERY",
] as const;
export type AutoEnforceableRetentionResourceType = (typeof AUTO_ENFORCEABLE_RETENTION_RESOURCE_TYPES)[number];

export interface DataRetentionPolicyDto {
  id: string;
  organizationId: string;
  resourceType: string;
  retentionDays: number;
  autoDelete: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertDataRetentionPolicyRequestDto {
  resourceType: string;
  retentionDays: number;
  autoDelete?: boolean;
}

/// Module 14 — Backup System / Disaster Recovery. `DATABASE` runs a real
/// `pg_dump` via `BackupService` (BackupPolicyRunnerService's Module 10
/// original only ever produced a JSON metadata snapshot — see
/// `BackupRunDto`'s doc comment for the full story); `STORAGE` archives
/// everything under the active `StorageService` provider's prefix for
/// this organization; `CONFIGURATION` snapshots non-secret env/settings;
/// `FULL` (default) does all three.
export type BackupScope = "DATABASE" | "STORAGE" | "CONFIGURATION" | "FULL";

export interface BackupPolicyDto {
  id: string;
  organizationId: string;
  frequency: string;
  retentionCount: number;
  lastBackupAt: string | null;
  scope: BackupScope;
  encrypt: boolean;
  lastPrunedAt: string | null;
  createdAt: string;
}

export const BACKUP_FREQUENCIES = ["HOURLY", "DAILY", "WEEKLY", "MONTHLY"] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

export interface UpsertBackupPolicyRequestDto {
  frequency: BackupFrequency;
  retentionCount?: number;
  scope?: BackupScope;
  encrypt?: boolean;
}

export type BackupRunStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type BackupTrigger = "SCHEDULED" | "MANUAL";

/// One row per actual backup execution — `BackupPolicy` is the schedule,
/// this is the history a restore wizard and `GET /backups/:id/verify`
/// (Disaster Recovery: Backup Verification) both read. `organizationId`
/// is nullable so a single-tenant Community Edition install (no
/// `Organization` in play) can still trigger/list full-system backups.
export interface BackupRunDto {
  id: string;
  organizationId: string | null;
  backupPolicyId: string | null;
  scope: BackupScope;
  trigger: BackupTrigger;
  status: BackupRunStatus;
  storageKey: string | null;
  sizeBytes: number | null;
  checksumSha256: string | null;
  encrypted: boolean;
  errorMessage: string | null;
  verifiedAt: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface TriggerBackupRequestDto {
  scope?: BackupScope;
  /// Overrides the org's `BackupPolicy.encrypt` for this one run — still
  /// requires `BACKUP_ENCRYPTION_KEY` to be configured when true.
  encrypt?: boolean;
}

/// `GET /backups/:id/restore-instructions` never performs the restore
/// itself (Disaster Recovery is deliberately an operator-run procedure,
/// not a self-service one-click "restore into production" button — see
/// ADR 0014) — it returns the exact `pg_restore`/object-storage-sync
/// commands an operator runs against a *target* environment, plus the
/// decryption key reminder if the run was encrypted.
export interface BackupRestoreInstructionsDto {
  backupRunId: string;
  scope: BackupScope;
  encrypted: boolean;
  steps: string[];
}

export type ComplianceExportStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

export interface ComplianceExportScope {
  /// If omitted, exports every resource type below for the organization.
  resourceTypes?: ("AUDIT_EVENTS" | "ORGANIZATION_MEMBERS" | "WORKFLOWS" | "INTEGRATION_CONNECTIONS")[];
  /// Scopes the export to a single user's data (GDPR Subject Access
  /// Request / right-to-export flows) — restricts AUDIT_EVENTS and
  /// ORGANIZATION_MEMBERS to rows about this user.
  subjectUserId?: string;
}

export interface ComplianceExportRequestDto {
  id: string;
  organizationId: string;
  requestedBy: string;
  scope: ComplianceExportScope;
  status: ComplianceExportStatus;
  downloadUrl: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CreateComplianceExportRequestDto {
  scope?: ComplianceExportScope;
}
