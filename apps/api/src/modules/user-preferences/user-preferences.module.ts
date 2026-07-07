import { Module } from '@nestjs/common';
import { USER_PREFERENCES_REPOSITORY } from './domain/repositories/user-preferences.repository.interface.js';
import { PrismaUserPreferencesRepository } from './infrastructure/persistence/prisma/prisma-user-preferences.repository.js';

@Module({
  providers: [
    {
      provide: USER_PREFERENCES_REPOSITORY,
      useClass: PrismaUserPreferencesRepository,
    },
  ],
  exports: [USER_PREFERENCES_REPOSITORY],
})
export class UserPreferencesModule {}
