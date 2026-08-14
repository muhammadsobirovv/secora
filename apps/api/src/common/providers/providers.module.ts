import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../config/env.validation.js';
import { DevMailService } from './mail/dev-mail.service.js';
import { SmtpMailService } from './mail/smtp-mail.service.js';
import { LocalDiskStorageService } from './storage/local-disk-storage.service.js';
import { S3CompatibleStorageService } from './storage/s3-compatible-storage.service.js';
import { InMemoryQueueService } from './queue/in-memory-queue.service.js';
import { RedisQueueService } from './queue/redis-queue.service.js';
import { MemoryCacheService } from './cache/memory-cache.service.js';
import { RedisCacheService } from './cache/redis-cache.service.js';
import { DiskCacheService } from './cache/disk-cache.service.js';
import { CACHE_SERVICE, MAIL_SERVICE, QUEUE_SERVICE, STORAGE_SERVICE } from './tokens.js';
import { PollerLeaseService } from '../concurrency/poller-lease.service.js';

/// Global module exporting the platform's four swappable provider
/// interfaces (mail/storage/queue/cache). Module 14 turned three of
/// these (storage/queue/cache) from "always the dev-local implementation"
/// into genuinely config-driven selections (`STORAGE_PROVIDER`/
/// `QUEUE_PROVIDER`/`CACHE_PROVIDER`) via `useFactory`, so a deployment
/// can move to Redis/S3-compatible storage without a code change — just
/// an env var. Module 15 (task #338) closes the same gap for mail —
/// `MAIL_PROVIDER=smtp` swaps in `SmtpMailService`. Every factory still
/// defaults to the zero-configuration Community Edition binding when the
/// corresponding env var is unset, preserving this module's original
/// "boots with nothing configured" guarantee.
@Global()
@Module({
  providers: [
    {
      provide: MAIL_SERVICE,
      useFactory: (configService: ConfigService<EnvConfig, true>) => {
        const provider = configService.get('MAIL_PROVIDER', { infer: true });
        return provider === 'smtp' ? new SmtpMailService(configService) : new DevMailService(configService);
      },
      inject: [ConfigService],
    },
    {
      provide: STORAGE_SERVICE,
      useFactory: (configService: ConfigService<EnvConfig, true>) => {
        const provider = configService.get('STORAGE_PROVIDER', { infer: true });
        return provider === 's3'
          ? new S3CompatibleStorageService(configService)
          : new LocalDiskStorageService();
      },
      inject: [ConfigService],
    },
    {
      provide: QUEUE_SERVICE,
      useFactory: (configService: ConfigService<EnvConfig, true>) => {
        const provider = configService.get('QUEUE_PROVIDER', { infer: true });
        return provider === 'redis' ? new RedisQueueService(configService) : new InMemoryQueueService(configService);
      },
      inject: [ConfigService],
    },
    {
      provide: CACHE_SERVICE,
      useFactory: (configService: ConfigService<EnvConfig, true>) => {
        const provider = configService.get('CACHE_PROVIDER', { infer: true });
        if (provider === 'redis') return new RedisCacheService(configService);
        if (provider === 'disk') return new DiskCacheService(configService);
        return new MemoryCacheService(configService);
      },
      inject: [ConfigService],
    },
    PollerLeaseService,
  ],
  exports: [MAIL_SERVICE, STORAGE_SERVICE, QUEUE_SERVICE, CACHE_SERVICE, PollerLeaseService],
})
export class ProvidersModule {}
