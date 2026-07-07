import { Inject, Injectable } from '@nestjs/common';
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
}
