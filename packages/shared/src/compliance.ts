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

export interface BackupPolicyDto {
  id: string;
  organizationId: string;
  frequency: string;
  retentionCount: number;
  lastBackupAt: string | null;
  createdAt: string;
}

export const BACKUP_FREQUENCIES = ["HOURLY", "DAILY", "WEEKLY", "MONTHLY"] as const;
export type BackupFrequency = (typeof BACKUP_FREQUENCIES)[number];

export interface UpsertBackupPolicyRequestDto {
  frequency: BackupFrequency;
  retentionCount?: number;
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
  scope: ComplianceExportScope;
}
