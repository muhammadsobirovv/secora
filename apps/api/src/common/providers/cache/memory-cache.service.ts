import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation.js';
import type { CacheService } from './cache-service.interface.js';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/// Community Edition default — a real in-process TTL cache (a `Map`
/// with lazy + periodic expiry sweeps), correct for a single-replica
/// deployment. Tracks `hits`/`misses` for the Admin Console's Cache
/// dashboard's `hitRate`.
@Injectable()
export class MemoryCacheService implements CacheService, OnModuleDestroy {
  private readonly store = new Map<string, CacheEntry>();
  private readonly defaultTtlSeconds: number;
  private hits = 0;
  private misses = 0;
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.defaultTtlSeconds = this.configService.get('CACHE_DEFAULT_TTL_SECONDS', { infer: true });
    this.sweepTimer = setInterval(() => this.sweep(), 60_000);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

  get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) this.store.delete(key);
      this.misses += 1;
      return Promise.resolve(null);
    }
    this.hits += 1;
    return Promise.resolve(entry.value as T);
  }

  set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + (ttlSeconds ?? this.defaultTtlSeconds) * 1000 });
    return Promise.resolve();
  }

  delete(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }

  stats(): Promise<{ entryCount: number | null; hitRate: number | null }> {
    const total = this.hits + this.misses;
    return Promise.resolve({
      entryCount: this.store.size,
      hitRate: total === 0 ? null : this.hits / total,
    });
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt < now) this.store.delete(key);
    }
  }
}
