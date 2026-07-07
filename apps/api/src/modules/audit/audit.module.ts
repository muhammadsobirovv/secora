import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AUDIT_REPOSITORY } from './domain/audit.repository.interface.js';
import { PrismaAuditRepository } from './infrastructure/persistence/prisma/prisma-audit.repository.js';

@Global()
@Module({
  providers: [
    AuditService,
    { provide: AUDIT_REPOSITORY, useClass: PrismaAuditRepository },
  ],
  exports: [AuditService],
})
export class AuditModule {}
