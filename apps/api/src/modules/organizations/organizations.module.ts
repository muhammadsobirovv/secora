import { Module } from '@nestjs/common';
import { ORGANIZATIONS_REPOSITORY } from './domain/repositories/organizations.repository.interface.js';
import { PrismaOrganizationsRepository } from './infrastructure/persistence/prisma/prisma-organizations.repository.js';

@Module({
  providers: [
    {
      provide: ORGANIZATIONS_REPOSITORY,
      useClass: PrismaOrganizationsRepository,
    },
  ],
  exports: [ORGANIZATIONS_REPOSITORY],
})
export class OrganizationsModule {}
