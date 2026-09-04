import { Inject, Injectable } from '@nestjs/common';
import type { AuditEvent } from '../../prisma-types.js';
import {
  AUDIT_REPOSITORY,
  type AuditRepository,
  type RecordAuditEventInput,
} from './domain/audit.repository.interface.js';

@Injectable()
export class AuditService {
  constructor(
    @Inject(AUDIT_REPOSITORY) private readonly auditRepository: AuditRepository,
  ) {}

  log(input: RecordAuditEventInput): Promise<void> {
    return this.auditRepository.record(input);
  }

  /// Module 15 — Privacy controls (task #342). Self-service only — always
  /// scoped to the caller's own userId (see export-user-data.use-case.ts,
  /// this method's one caller), for the GDPR data-export flow.
  ///
  /// Module 18 — task #519 (audit log integrity sweep), disclosed known
  /// gap: this is the *only* audit-event read path anywhere in
  /// apps/api/src. There is no admin/owner-tier endpoint for a workspace
  /// admin to review that workspace's audit history — the capability
  /// simply doesn't exist yet, so there's no over-broad-access bug to fix
  /// here, just a missing feature. Adding one would need a new
  /// workspace-scoped query handler + controller route gated by an
  /// admin/owner role guard (following this module's existing RBAC
  /// patterns), which is product feature work beyond this audit phase's
  /// scope. Tracked as a concrete follow-up in docs/operations/ (Phase
  /// 29).
  listRecentForUser(userId: string, limit = 50): Promise<AuditEvent[]> {
    return this.auditRepository.findRecentByUserId(userId, limit);
  }
}
