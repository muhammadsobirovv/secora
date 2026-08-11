import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppException } from '../../exceptions/app.exception.js';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { CacheService } from './cache-service.interface.js';

/// Multi-replica cache backend (`CACHE_PROVIDER=redis`, requires
/// `REDIS_URL`) — every replica reads/writes the same Redis instance,
/// so a cache write on one API node is immediately visible to another
/// (unlike `MemoryCacheService`, which is correct only for a single
/// replica). Sandbox disclosure: same as `RedisQueueService` — `ioredis`
/// is declared, not installed/exercised here.
@Injectable()
export class RedisCacheService implements CacheService, OnModuleDestroy {
  private readonly client: Redis;
  private readonly keyPrefix = 'pentesthub:cache:';
  private readonly defaultTtlSeconds: number;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    const redisUrl = this.configService.get('REDIS_URL', { infer: true });
    if (!redisUrl) {
      throw new AppException(
        'STORAGE_PROVIDER_NOT_CONFIGURED',
        'CACHE_PROVIDER=redis requires REDIS_URL to be set.',
        500,
      );
    }
    this.client = new Redis(redisUrl);
    this.defaultTtlSeconds = this.configService.get('CACHE_DEFAULT_TTL_SECONDS', { infer: true });
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.client.get(this.keyPrefix + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.client.set(this.keyPrefix + key, JSON.stringify(value), 'EX', ttlSeconds ?? this.defaultTtlSeconds);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.keyPrefix + key);
  }

  stats(): Promise<{ entryCount: number | null; hitRate: number | null }> {
    // A precise entry count would require SCANning the whole keyspace
    // under our prefix — too expensive to run on every dashboard load;
    // the Admin Console's Cache page reports "unavailable for Redis" for
    // both fields instead of an approximate/misleading number.
    return Promise.resolve({ entryCount: null, hitRate: null });
  }
}
