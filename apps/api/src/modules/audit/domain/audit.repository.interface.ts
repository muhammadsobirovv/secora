import type { AuditEvent, AuditEventType } from '../../../prisma-types.js';

export interface RecordAuditEventInput {
  userId?: string;
  type: AuditEventType;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRepository {
  record(input: RecordAuditEventInput): Promise<void>;
  /// Module 15 — Privacy controls (task #342). The first read path this
  /// previously write-only repository has ever needed — backs the
  /// self-service data export (a user's own recent security-relevant
  /// activity), not a general-purpose audit query API. Ordered newest
  /// first; `limit` keeps a single export request bounded regardless of
  /// account age.
  findRecentByUserId(userId: string, limit: number): Promise<AuditEvent[]>;
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');
