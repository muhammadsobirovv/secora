import { Global, Module } from '@nestjs/common';
import { DevMailService } from './mail/dev-mail.service.js';
import { LocalDiskStorageService } from './storage/local-disk-storage.service.js';
import { InMemoryQueueService } from './queue/in-memory-queue.service.js';
import { MAIL_SERVICE, QUEUE_SERVICE, STORAGE_SERVICE } from './tokens.js';

/// Global module exporting the three swappable platform provider interfaces.
/// Bound to dev-local implementations for now — see decision 8 in
/// docs/adr/0001-auth-module.md.
@Global()
@Module({
  providers: [
    { provide: MAIL_SERVICE, useClass: DevMailService },
    { provide: STORAGE_SERVICE, useClass: LocalDiskStorageService },
    { provide: QUEUE_SERVICE, useClass: InMemoryQueueService },
  ],
  exports: [MAIL_SERVICE, STORAGE_SERVICE, QUEUE_SERVICE],
})
export class ProvidersModule {}
