import type {
  BackupPolicyDto,
  ComplianceExportRequestDto,
  ComplianceExportScope,
  DataRetentionPolicyDto,
} from '@pentesthub/shared';
import type { BackupPolicy, ComplianceExportRequest, DataRetentionPolicy } from '../../../prisma-types.js';

export function toDataRetentionPolicyDto(policy: DataRetentionPolicy): DataRetentionPolicyDto {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    resourceType: policy.resourceType,
    retentionDays: policy.retentionDays,
    autoDelete: policy.autoDelete,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

export function toBackupPolicyDto(policy: BackupPolicy): BackupPolicyDto {
  return {
    id: policy.id,
    organizationId: policy.organizationId,
    frequency: policy.frequency,
    retentionCount: policy.retentionCount,
    lastBackupAt: policy.lastBackupAt ? policy.lastBackupAt.toISOString() : null,
    scope: policy.scope,
    encrypt: policy.encrypt,
    lastPrunedAt: policy.lastPrunedAt ? policy.lastPrunedAt.toISOString() : null,
    createdAt: policy.createdAt.toISOString(),
  };
}

export function toComplianceExportRequestDto(request: ComplianceExportRequest): ComplianceExportRequestDto {
  return {
    id: request.id,
    organizationId: request.organizationId,
    requestedBy: request.requestedBy,
    scope: (request.scope as unknown as ComplianceExportScope) ?? {},
    status: request.status,
    downloadUrl: request.downloadUrl,
    createdAt: request.createdAt.toISOString(),
    completedAt: request.completedAt ? request.completedAt.toISOString() : null,
  };
}
