import { Module } from '@nestjs/common';
import { API_KEYS_REPOSITORY } from './domain/repositories/api-keys.repository.interface.js';
import { PrismaApiKeysRepository } from './infrastructure/persistence/prisma/prisma-api-keys.repository.js';

@Module({
  providers: [
    { provide: API_KEYS_REPOSITORY, useClass: PrismaApiKeysRepository },
  ],
  exports: [API_KEYS_REPOSITORY],
})
export class ApiKeysModule {}
