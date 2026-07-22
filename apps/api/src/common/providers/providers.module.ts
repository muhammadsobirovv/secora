import { Global, Module } from '@nestjs/common';
import { DevMailService } from './mail/dev-mail.service.js';
import { LocalDiskStorageService } from './storage/local-disk-storage.service.js';
import { InMemoryQueueService } from './queue/in-memory-queue.service.js';
import { MAIL_SERVICE, QUEUE_SERVICE, STORAGE_SERVICE } from './tokens.js';
import { PollerLeaseService } from '../concurrency/poller-lease.service.js';

/// Global module exporting the three swappable platform provider interfaces.
/// Bound to dev-local implementations for now — see decision 8 in
/// docs/adr/0001-auth-module.md.
///
/// Module 10 — High Availability: also exports `PollerLeaseService`
/// (concrete class, not an interface-behind-a-token like the three
/// above — there's exactly one real implementation, backed directly by
/// Postgres via Prisma, with no swappable alternative planned) here so
/// every poller service across every feature module can inject it
/// without that module needing its own explicit import — the same
/// "global infra, no per-module wiring" convenience this module already
/// provides for mail/storage/queue.
@Global()
@Module({
  providers: [
    { provide: MAIL_SERVICE, useClass: DevMailService },
    { provide: STORAGE_SERVICE, useClass: LocalDiskStorageService },
    { provide: QUEUE_SERVICE, useClass: InMemoryQueueService },
    PollerLeaseService,
  ],
  exports: [MAIL_SERVICE, STORAGE_SERVICE, QUEUE_SERVICE, PollerLeaseService],
})
export class ProvidersModule {}
