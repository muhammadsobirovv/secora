import { Module } from '@nestjs/common';
import { RbacService } from './rbac.service.js';
import { RBAC_REPOSITORY } from './domain/repositories/rbac.repository.interface.js';
import { PrismaRbacRepository } from './infrastructure/persistence/prisma/prisma-rbac.repository.js';

@Module({
  providers: [
    RbacService,
    { provide: RBAC_REPOSITORY, useClass: PrismaRbacRepository },
  ],
  exports: [RbacService],
})
export class RbacModule {}
