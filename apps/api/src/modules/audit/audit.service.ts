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

  /// Module 15 — Privacy controls (task #342).
  listRecentForUser(userId: string, limit = 50): Promise<AuditEvent[]> {
    return this.auditRepository.findRecentByUserId(userId, limit);
  }
}
