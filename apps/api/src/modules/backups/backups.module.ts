import { Module } from '@nestjs/common';
import { BackupService } from './backup.service.js';
import { BackupsController } from './controllers/backups.controller.js';

/// Module 14 — Backup System. `ProvidersModule` (STORAGE_SERVICE) is
/// `@Global()`, so no explicit import is needed here to reach it — same
/// convention every other module that injects `STORAGE_SERVICE` already
/// follows (see `compliance.module.ts`).
@Module({
  controllers: [BackupsController],
  providers: [BackupService],
  exports: [BackupService],
})
export class BackupsModule {}
