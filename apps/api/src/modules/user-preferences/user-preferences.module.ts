import { Module } from '@nestjs/common';
import { USER_PREFERENCES_REPOSITORY } from './domain/repositories/user-preferences.repository.interface.js';
import { PrismaUserPreferencesRepository } from './infrastructure/persistence/prisma/prisma-user-preferences.repository.js';
import { UpdatePreferencesHandler } from './commands/update-preferences.command.js';
import { GetPreferencesHandler } from './queries/get-preferences.query.js';
import { PreferencesController } from './controllers/preferences.controller.js';

@Module({
  controllers: [PreferencesController],
  providers: [
    {
      provide: USER_PREFERENCES_REPOSITORY,
      useClass: PrismaUserPreferencesRepository,
    },
    UpdatePreferencesHandler,
    GetPreferencesHandler,
  ],
  exports: [USER_PREFERENCES_REPOSITORY],
})
export class UserPreferencesModule {}
