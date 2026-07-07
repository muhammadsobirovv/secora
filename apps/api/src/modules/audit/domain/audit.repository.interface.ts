import type { AuditEventType } from '../../../prisma-types.js';

export interface RecordAuditEventInput {
  userId?: string;
  type: AuditEventType;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRepository {
  record(input: RecordAuditEventInput): Promise<void>;
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');
